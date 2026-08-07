-- Retention queue tests: favorite reminders, new-mic alerts, weekly digest.
begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- The indexes these queues need (20260807000600, audit findings F-009, F-013).
--
-- Asserted here rather than in search-indexes.test.sql because they exist for
-- these three functions and nothing else. A cron job has no user waiting on
-- it, so a lost index shows up as the database being slow for everyone rather
-- than as a slow screen, and nothing else in the suite would notice.
--
-- Checked by access method, not merely by existence: a btree on a geography
-- column would be created without complaint, would look right in a schema
-- diff, and could not answer an st_dwithin.
-- ---------------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_class i
      join pg_index x on x.indexrelid = i.oid
      join pg_am am on am.oid = i.relam
     where i.relname = 'profiles_home_location_gist' and am.amname = 'gist'
  ),
  'profiles.home_location has a GiST index, so the nearby queues are not a seq scan'
);
select ok(
  (select indpred is not null from pg_index
    where indexrelid = 'profiles_home_location_gist'::regclass),
  'and it is partial, so profiles with no geocoded home area stay out of it'
);
select ok(
  exists (select 1 from pg_class where relname = 'favorites_series_idx'),
  'favorites is indexed by series_id, which the hourly reminder join drives on'
);

-- Fixture: a series with a night today (23:59 UTC so it is still upcoming),
-- favorited by p1.
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000e7', 'retention venue', 'x', 'Seattle', 'WA',
        'POINT(-122.33 47.61)', 'approved');
insert into mic_series (id, venue_id, title, disciplines, rrule, anchor_date, start_time,
                        timezone, signup_method, moderation_status)
values ('20000000-0000-4000-c000-0000000000e7', '10000000-0000-4000-b000-0000000000e7',
        'retention mic', '{music}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
        '23:59', 'UTC', 'first_come', 'approved');
insert into favorites (profile_id, series_id)
values ('00000000-0000-4000-a000-000000000001', '20000000-0000-4000-c000-0000000000e7');

-- The clock is injected (like private.rate_limit) because the queue now
-- refuses to remind before 9 AM local; the fixture night is at 23:59.
select is(
  private.queue_favorite_reminders((current_date + time '05:00') at time zone 'UTC'),
  0,
  'nothing queues in the middle of the night, even for a night happening today'
);
select cmp_ok(
  private.queue_favorite_reminders((current_date + time '10:00') at time zone 'UTC'),
  '>=', 1,
  'a favorited mic happening today queues a reminder once the morning arrives'
);
select is(
  private.queue_favorite_reminders((current_date + time '10:00') at time zone 'UTC'),
  0,
  'rerunning queues nothing new (idempotent per occurrence)'
);

-- Preferences are honored: turning reminders off stops the queue.
insert into notification_prefs (profile_id, favorite_reminders)
values ('00000000-0000-4000-a000-000000000003', false);
insert into favorites (profile_id, series_id)
values ('00000000-0000-4000-a000-000000000003', '20000000-0000-4000-c000-0000000000e7');
create temp table _run1 as
  select private.queue_favorite_reminders((current_date + time '10:00') at time zone 'UTC');
-- Scoped to the fixture mic: seeded favorites may legitimately remind p3
-- about other mics queued before the opt-out existed.
select is(
  (select count(*)::int from notification_outbox n
   where n.profile_id = '00000000-0000-4000-a000-000000000003'
     and n.kind = 'favorite_reminder'
     and n.payload ->> 'occurrence_id' in (
       select o.id::text from mic_occurrences o
       where o.series_id = '20000000-0000-4000-c000-0000000000e7'
     )),
  0,
  'reminders respect the opt-out'
);

-- New-mic alerts: p1 lives near the venue with the pref on.
update profiles set home_location = 'POINT(-122.33 47.60)'
where id = '00000000-0000-4000-a000-000000000001';
insert into notification_prefs (profile_id, new_mic_nearby, nearby_radius_km)
values ('00000000-0000-4000-a000-000000000001', true, 25)
on conflict (profile_id) do update set new_mic_nearby = true, nearby_radius_km = 25;

select cmp_ok(
  private.queue_new_mic_alerts(), '>=', 1,
  'a new approved mic within the radius queues an alert'
);
select is(
  private.queue_new_mic_alerts(), 0,
  'new-mic alerts are idempotent per series'
);

-- Out of radius: shrink the radius to 1 km from a far-away point.
update profiles set home_location = 'POINT(-100.0 40.0)'
where id = '00000000-0000-4000-a000-000000000002';
insert into notification_prefs (profile_id, new_mic_nearby, nearby_radius_km)
values ('00000000-0000-4000-a000-000000000002', true, 1)
on conflict (profile_id) do update set new_mic_nearby = true, nearby_radius_km = 1;
create temp table _run2 as select private.queue_new_mic_alerts();
select is(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000002' and kind = 'new_mic_nearby'),
  0,
  'no alert outside the chosen radius'
);

-- Weekly digest.
update notification_prefs set weekly_digest = true
where profile_id = '00000000-0000-4000-a000-000000000001';
select cmp_ok(
  private.queue_weekly_digest(), '>=', 1,
  'the weekly digest queues for opted-in users with nearby nights'
);
select is(
  private.queue_weekly_digest(), 0,
  'the digest sends once per ISO week'
);

select * from finish();
rollback;
