-- Retention: favorite day-of reminders, new-mic-nearby alerts, and the
-- weekly digest. All three enqueue into notification_outbox and are
-- idempotent per (profile, subject), so reruns never double-notify.

create or replace function private.queue_favorite_reminders()
returns int
language sql
security definer
set search_path = ''
as $$
  with due as (
    select f.profile_id, o.id as occurrence_id,
           coalesce(o.override_title, s.title) as title, o.starts_at
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
           'Tonight at ' || to_char(d.starts_at, 'FMHH12:MI am') || ' UTC. Get on the list.',
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

create or replace function private.queue_new_mic_alerts()
returns int
language sql
security definer
set search_path = ''
as $$
  with fresh_series as (
    select s.id, s.title, v.location, v.city
    from public.mic_series s
    join public.venues v on v.id = s.venue_id
    where s.moderation_status = 'approved'
      and s.deleted_at is null
      and s.created_at > now() - interval '2 days'
  ),
  audience as (
    select p.id as profile_id, fs.id as series_id, fs.title, fs.city
    from fresh_series fs
    join public.profiles p on p.deleted_at is null and p.home_location is not null
    join public.notification_prefs np on np.profile_id = p.id and np.new_mic_nearby
    where public.st_dwithin(p.home_location, fs.location, np.nearby_radius_km * 1000)
  ),
  inserted as (
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select a.profile_id, 'new_mic_nearby', 'New mic near you',
           a.title || ' just appeared in ' || a.city || '.',
           jsonb_build_object('series_id', a.series_id)
    from audience a
    where not exists (
      select 1 from public.notification_outbox n
      where n.profile_id = a.profile_id
        and n.kind = 'new_mic_nearby'
        and n.payload ->> 'series_id' = a.series_id::text
    )
    returning 1
  )
  select count(*)::int from inserted;
$$;

create or replace function private.queue_weekly_digest()
returns int
language sql
security definer
set search_path = ''
as $$
  with counts as (
    select p.id as profile_id, count(distinct o.id) as nights
    from public.profiles p
    join public.notification_prefs np on np.profile_id = p.id and np.weekly_digest
    join public.venues v
      on p.home_location is not null
     and public.st_dwithin(p.home_location, v.location, 40000)
    join public.mic_series s on s.venue_id = v.id
      and s.deleted_at is null and s.moderation_status = 'approved'
    join public.mic_occurrences o on o.series_id = s.id
      and o.status = 'scheduled'
      and o.starts_at between now() and now() + interval '7 days'
    where p.deleted_at is null
    group by p.id
  ),
  inserted as (
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select c.profile_id, 'weekly_digest', 'Your week in open mics',
           c.nights || ' nights are happening near you this week.',
           jsonb_build_object('week', to_char(now(), 'IYYY-IW'))
    from counts c
    where not exists (
      select 1 from public.notification_outbox n
      where n.profile_id = c.profile_id
        and n.kind = 'weekly_digest'
        and n.payload ->> 'week' = to_char(now(), 'IYYY-IW')
    )
    returning 1
  )
  select count(*)::int from inserted;
$$;

-- Schedules (pg_cron where available; external scheduling otherwise).
do $$
begin
  perform cron.schedule('favorite-reminders', '0 * * * *',
    'select private.queue_favorite_reminders()');
  perform cron.schedule('new-mic-alerts', '30 */4 * * *',
    'select private.queue_new_mic_alerts()');
  perform cron.schedule('weekly-digest', '0 17 * * 1',
    'select private.queue_weekly_digest()');
exception when others then
  raise notice 'pg_cron unavailable; schedule the retention queue functions externally';
end $$;
