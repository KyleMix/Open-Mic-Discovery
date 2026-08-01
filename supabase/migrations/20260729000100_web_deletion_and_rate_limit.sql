-- Web-based account deletion (Google Play requirement) and the shared
-- rate limit helper.
--
-- Google Play requires a deletion path that works for people who have
-- uninstalled the app. The in-app path stays delete_account(); this
-- migration extracts its body into private.delete_account_for(uuid) so a
-- service-role RPC (delete_account_web) can run the identical deletion for
-- an identity confirmed over email by the deletion-request Edge Function.
--
-- The rate limit helper lands here because the Edge Function needs it now;
-- a later migration applies it to reports, flags, claims, and signups.

-- ---------------------------------------------------------------------------
-- Rate limiting: fixed-window counters keyed by an arbitrary text key.
-- private.rate_limit returns true when the call is allowed and counts it.
-- p_now is injectable so tests can cross window boundaries without sleeping.
-- ---------------------------------------------------------------------------
create table private.rate_limit_counters (
  key           text not null,
  window_start  timestamptz not null,
  calls         integer not null default 0,
  primary key (key, window_start)
);
-- Never API-exposed (private schema) and default-deny for the API roles.
alter table private.rate_limit_counters enable row level security;

create or replace function private.rate_limit(
  p_key text,
  p_max_calls integer,
  p_window interval,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_calls integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / extract(epoch from p_window))
    * extract(epoch from p_window)
  );

  -- Drop this key's expired windows so the table stays small.
  delete from private.rate_limit_counters
  where key = p_key and window_start < v_window_start;

  insert into private.rate_limit_counters as c (key, window_start, calls)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set calls = c.calls + 1
  returning calls into v_calls;

  return v_calls <= p_max_calls;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion body, shared by the in-app and web paths. Identical end
-- state by construction: both paths run this exact function.
-- ---------------------------------------------------------------------------
create or replace function private.delete_account_for(v_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles where id = v_uid and deleted_at is null
  ) then
    raise exception 'account not found or already deleted' using errcode = 'P0002';
  end if;
  delete from public.favorites where profile_id = v_uid;
  delete from public.attendance_log where profile_id = v_uid;
  delete from public.device_push_tokens where profile_id = v_uid;
  delete from public.notification_prefs where profile_id = v_uid;
  delete from public.notification_outbox where profile_id = v_uid;
  delete from public.blocks where blocker_id = v_uid or blocked_id = v_uid;
  delete from public.performer_profiles where profile_id = v_uid;
  update public.producer_profiles
  set contact_email = null, contact_phone = null, payout_ref = null
  where profile_id = v_uid;

  -- 22 hex chars (88 bits) of the uuid keep the anonymized handle unique
  -- within the 30-char handle limit; short prefixes have collided.
  update public.profiles
  set handle = ('deleted_' || right(replace(v_uid::text, '-', ''), 22))::public.citext,
      display_name = 'Deleted user',
      avatar_url = null,
      bio = null,
      home_city = null,
      home_region = null,
      home_postal_code = null,
      home_lat = null,
      home_lng = null,
      home_location = null,
      birth_year = null,
      link_instagram = null,
      link_tiktok = null,
      link_youtube = null,
      link_website = null,
      deleted_at = now()
  where id = v_uid;

  -- Removing the auth user ends all sessions and frees the email.
  delete from auth.identities where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- In-app path, unchanged signature and behavior.
create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.delete_account_for(auth.uid());
end;
$$;

-- Web path: the deletion-request Edge Function confirms identity through an
-- emailed sign-in link, then calls this with the service role. Never
-- callable by end users or anonymous clients.
create or replace function delete_account_web(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), current_user::text) not in ('service_role', 'postgres') then
    raise exception 'service role only' using errcode = '42501';
  end if;
  -- An account that never finished onboarding has no profile row but still
  -- holds a sign-in; web deletion must remove it too.
  if not exists (select 1 from public.profiles where id = p_user_id) then
    if not exists (select 1 from auth.users where id = p_user_id) then
      raise exception 'account not found or already deleted' using errcode = 'P0002';
    end if;
    delete from auth.identities where user_id = p_user_id;
    delete from auth.users where id = p_user_id;
    return;
  end if;
  perform private.delete_account_for(p_user_id);
end;
$$;
revoke execute on function delete_account_web(uuid) from public, anon, authenticated;
grant execute on function delete_account_web(uuid) to service_role;

-- Rate limit gate for the Edge Function. Keys are salted hashes computed by
-- the function; no raw email or IP address is ever stored. Service role only.
create or replace function deletion_request_allowed(p_email_key text, p_ip_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), current_user::text) not in ('service_role', 'postgres') then
    raise exception 'service role only' using errcode = '42501';
  end if;
  -- Both limits must pass: 3 emails per address per hour, 10 per IP per hour.
  return private.rate_limit('web-del-email:' || p_email_key, 3, interval '1 hour')
     and private.rate_limit('web-del-ip:' || p_ip_key, 10, interval '1 hour');
end;
$$;
revoke execute on function deletion_request_allowed(text, text) from public, anon, authenticated;
grant execute on function deletion_request_allowed(text, text) to service_role;
