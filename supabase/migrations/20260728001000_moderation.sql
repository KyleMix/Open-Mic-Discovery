-- Safety and compliance: automated first-pass text filter, admin moderation,
-- and full account deletion (Guideline 1.2 and account deletion requirements).

-- ---------------------------------------------------------------------------
-- Automated first-pass content filter. Clean free text goes live instantly;
-- anything matching the banned list is held as pending for the moderation
-- queue. The list is data, not code: admins extend it without a deploy.
-- ---------------------------------------------------------------------------
create table banned_terms (
  term        text primary key,
  created_at  timestamptz not null default now()
);
alter table banned_terms enable row level security;
create policy "banned terms admin read" on banned_terms
  for select to authenticated using (private.is_admin());
create policy "banned terms admin write" on banned_terms
  for insert to authenticated with check (private.is_admin());
create policy "banned terms admin delete" on banned_terms
  for delete to authenticated using (private.is_admin());

-- Seed with a starter list; expanded from the moderation queue over time.
insert into banned_terms (term) values
  ('kike'), ('spic'), ('chink'), ('wetback'), ('tranny'), ('faggot'),
  ('nigger'), ('nigga'), ('raghead'), ('kill yourself'), ('kys');

create or replace function private.text_is_clean(variadic p_texts text[])
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select not exists (
    select 1
    from public.banned_terms b
    cross join unnest(p_texts) as t(txt)
    where t.txt is not null
      and lower(t.txt) like '%' || b.term || '%'
  );
$$;

-- Profiles: replace the always-pending rule with filter-driven state.
create or replace function private.guard_profile_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.is_admin := false;
      new.eula_accepted_at := now();
      new.moderation_status := case
        when private.text_is_clean(new.display_name, new.bio, new.handle::text)
        then 'approved' else 'pending' end;
    else
      new.is_admin := old.is_admin;
      if new.moderation_status is distinct from old.moderation_status then
        new.moderation_status := old.moderation_status;
      end if;
      if new.eula_version is distinct from old.eula_version then
        new.eula_accepted_at := now();
      else
        new.eula_accepted_at := old.eula_accepted_at;
      end if;
      if new.display_name is distinct from old.display_name
         or new.bio is distinct from old.bio
         or new.handle is distinct from old.handle then
        new.moderation_status := case
          when private.text_is_clean(new.display_name, new.bio, new.handle::text)
          then 'approved' else 'pending' end;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Venues and series: same filter-driven behavior.
create or replace function private.guard_moderated_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean boolean;
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_table_name = 'venues' then
      v_clean := private.text_is_clean(new.name, new.parking_notes);
    else
      v_clean := private.text_is_clean(new.title, new.description, new.cost_note);
    end if;
    if tg_op = 'INSERT' then
      new.moderation_status := case when v_clean then 'approved' else 'pending' end;
    elsif new.moderation_status is distinct from old.moderation_status then
      new.moderation_status := old.moderation_status;
    elsif not v_clean then
      new.moderation_status := 'pending';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin moderation of held content.
-- ---------------------------------------------------------------------------
create or replace function moderate_content(
  p_target report_target,
  p_target_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.moderation_status :=
    case when p_approve then 'approved' else 'rejected' end;
begin
  if not private.is_admin() then
    raise exception 'only admins can moderate content' using errcode = '42501';
  end if;
  if p_target = 'profile' then
    update public.profiles set moderation_status = v_status where id = p_target_id;
  elsif p_target = 'venue' then
    update public.venues set moderation_status = v_status where id = p_target_id;
  elsif p_target = 'series' then
    update public.mic_series set moderation_status = v_status where id = p_target_id;
  else
    raise exception 'unsupported moderation target %', p_target;
  end if;
end;
$$;
grant execute on function moderate_content to authenticated;

-- Admin visibility into held content for the queue (RLS otherwise hides
-- other users' pending rows from everyone, including admins for venues).
create policy "venues admin update" on venues
  for update to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- Account deletion: reachable in-app, immediate, and documented.
-- The profile row is anonymized (signups and lineup history keep integrity),
-- personal rows are hard-deleted, and the auth user is removed so the
-- account can never sign in again.
-- ---------------------------------------------------------------------------
-- The anonymized profile must outlive the auth user (signups and lineup
-- history reference it), so the cascade from auth.users is severed. Profile
-- rows are still only ever created with an authenticated user's own id.
alter table profiles drop constraint profiles_id_fkey;

create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
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

  update public.profiles
  set handle = ('deleted_' || substr(v_uid::text, 1, 8))::public.citext,
      display_name = 'Deleted user',
      avatar_url = null,
      bio = null,
      home_city = null,
      home_location = null,
      birth_year = null,
      deleted_at = now()
  where id = v_uid;

  -- Removing the auth user ends all sessions and frees the email.
  delete from auth.identities where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;
grant execute on function delete_account to authenticated;
