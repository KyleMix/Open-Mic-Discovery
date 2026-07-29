-- On-deck notifications and event posters.
--
-- On deck: the producer running a night can flag the next performer as
-- "on deck". The flag lives on the signup, flows to every open roster and
-- signup card over Realtime, and enqueues a push through the existing
-- notification outbox (respecting the performer's signup_updates pref).
-- Only the series owner (or an admin) can set it, enforced here, not in
-- the client.
--
-- Posters: a mic series can carry one poster image in a public storage
-- bucket. Only the series owner writes inside their own folder, same
-- pattern as avatars. Posters are subject to the existing listing flag
-- and report flows.

alter table signups add column on_deck_at timestamptz;

-- Append-only view change: on_deck_at joins the roster columns.
create or replace view signup_roster
with (security_invoker = on) as
  select
    sg.id,
    sg.occurrence_id,
    sg.performer_id,
    sg.status,
    sg.slot_position,
    sg.created_at,
    p.handle,
    p.display_name,
    sg.on_deck_at
  from signups sg
  left join public_profiles p on p.id = sg.performer_id;

create or replace function mark_on_deck(p_signup_id uuid, p_on_deck boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signup public.signups%rowtype;
begin
  select * into v_signup from public.signups where id = p_signup_id;
  if not found then
    raise exception 'signup not found' using errcode = 'P0002';
  end if;
  if not (private.owns_occurrence_series(v_signup.occurrence_id) or private.is_admin()) then
    raise exception 'only the producer of this mic can set on deck' using errcode = '42501';
  end if;
  if p_on_deck and v_signup.status not in ('confirmed', 'drawn') then
    raise exception 'only performers on the list can be on deck' using errcode = '23514';
  end if;

  update public.signups
  set on_deck_at = case when p_on_deck then now() else null end
  where id = p_signup_id;

  -- Notify once per flagging, unless the performer opted out of signup
  -- updates (a missing prefs row counts as opted in, matching retention).
  if p_on_deck and v_signup.on_deck_at is null then
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select v_signup.performer_id, 'signup_status',
           'You are on deck',
           'Get ready: you are up soon at ' || coalesce(o.override_title, s.title) || '.',
           jsonb_build_object('occurrence_id', v_signup.occurrence_id, 'on_deck', true)
    from public.mic_occurrences o
    join public.mic_series s on s.id = o.series_id
    where o.id = v_signup.occurrence_id
      and not exists (
        select 1 from public.notification_prefs np
        where np.profile_id = v_signup.performer_id and not np.signup_updates
      );
  end if;
end;
$$;
grant execute on function mark_on_deck to authenticated;

-- Favorite day-of reminders now speak the mic's local time, not UTC.
create or replace function private.queue_favorite_reminders()
returns int
language sql
security definer
set search_path = ''
as $$
  with due as (
    select f.profile_id, o.id as occurrence_id,
           coalesce(o.override_title, s.title) as title, o.starts_at, s.timezone
    from public.favorites f
    join public.mic_series s on s.id = f.series_id
      and s.deleted_at is null and s.moderation_status = 'approved'
    join public.mic_occurrences o on o.series_id = s.id
      and o.status = 'scheduled'
      and o.local_date = (now() at time zone s.timezone)::date
      and o.starts_at > now()
    left join public.notification_prefs np on np.profile_id = f.profile_id
    where coalesce(np.favorite_reminders, true)
  ),
  inserted as (
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select d.profile_id, 'favorite_reminder', d.title,
           'Tonight at '
             || trim(to_char(d.starts_at at time zone d.timezone, 'FMHH12:MI PM'))
             || '. Get on the list.',
           jsonb_build_object('occurrence_id', d.occurrence_id)
    from due d
    where not exists (
      select 1 from public.notification_outbox n
      where n.profile_id = d.profile_id
        and n.kind = 'favorite_reminder'
        and n.payload ->> 'occurrence_id' = d.occurrence_id::text
    )
    returning 1
  )
  select count(*)::int from inserted;
$$;

-- Event poster on the series.
alter table mic_series add column poster_url text
  check (char_length(poster_url) <= 500);

insert into storage.buckets (id, name, public)
values ('posters', 'posters', true)
on conflict (id) do nothing;

create policy "posters public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'posters');

create policy "posters owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'posters'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "posters owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'posters'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'posters'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "posters owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'posters'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
