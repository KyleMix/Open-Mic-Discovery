-- Spots left, and the number a performer gets told.
--
-- The count on screen has to be the count the lifecycle trigger enforces. If
-- they ever drift, a mic reads "2 spots left" and hands the next person a
-- waitlist place, which is worse than showing nothing at all. Most of what
-- follows is pinning those two together.
begin;
select plan(14);

insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000f5', 'spots venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');

-- Capacity 2, nightly, owned by p2, wide open signup window.
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000f5', '10000000-0000-4000-b000-0000000000f5',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'spots test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
   '23:59', 'UTC', 'first_come', '30 days', 2, 'approved'),
  -- A listing still in moderation, to check nothing leaks through the view.
  ('20000000-0000-4000-c000-0000000000f6', '10000000-0000-4000-b000-0000000000f5',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'held test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
   '23:59', 'UTC', 'first_come', '30 days', 2, 'pending');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000031', 's1@t.local'),
  ('00000000-0000-4000-a000-000000000032', 's2@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000031', 'spot_one', 'Spot One', 'The First', 'Seattle', 'WA',
   true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000032', 'spot_two', 'Spot Two', 'The Second', 'Seattle', 'WA',
   true, '1.0', 'approved');

create temp table night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f5'
    and starts_at > now() order by starts_at limit 1;
grant select on night to public;

-- ---------------------------------------------------------------------------
-- An empty night shows every spot.
-- ---------------------------------------------------------------------------
set local role anon;
select is(
  (select spots_left from occurrence_spots where occurrence_id = (select id from night)),
  2,
  'an untouched night has all its spots'
);
select is(
  (select taken from occurrence_spots where occurrence_id = (select id from night)),
  0,
  'and nobody in them'
);
select is(
  (select count(*)::int from occurrence_spots
   where series_id = '20000000-0000-4000-c000-0000000000f6'),
  0,
  'a listing still in moderation reports no numbers at all'
);
reset role;

-- ---------------------------------------------------------------------------
-- Signups take spots, and the count matches what capacity actually enforces.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from night;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from night;

select is(
  (select spots_left from occurrence_spots where occurrence_id = (select id from night)),
  0,
  'two signups against a capacity of two leaves none'
);

-- The third person is waitlisted by the lifecycle trigger. If the view had
-- counted them, the screen would say -1 and the room would look oversold.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000032","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from night;
select is(
  (select status from signups
   where occurrence_id = (select id from night) and performer_id = auth.uid()),
  'waitlisted'::signup_status,
  'the third signup is waitlisted, as capacity says'
);
select is(
  (select spots_left from occurrence_spots where occurrence_id = (select id from night)),
  0,
  'and the count stays at none rather than going negative'
);

-- A plan is not a slot. Counting it would show "full" on a night the database
-- would happily confirm a signup for.
insert into attendance_plans (occurrence_id, profile_id) select id, auth.uid() from night;
select is(
  (select planning_performers from occurrence_spots
   where occurrence_id = (select id from night)),
  0,
  'someone already on the list is not counted twice as also planning'
);

-- ---------------------------------------------------------------------------
-- What the performer gets told.
--
-- Reads of the outbox run as postgres on purpose: the table is service-role
-- only (RLS on, no policies), so asserting as `authenticated` would return
-- zero rows whether or not anything was queued, and pass for the wrong
-- reason.
--
-- Signing up queues a receipt at insert (the commit moment gets a
-- notification in hand, not just a re-rendered card), and numbers get
-- handed out when the host draws or reorders.
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select body from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000032'),
  'You are on the waitlist. If a spot opens, you move up.',
  'signing up onto a full night says waitlist at the moment of commit'
);

-- A lottery night, so the draw assigns status and number in one statement.
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000f7', '10000000-0000-4000-b000-0000000000f5',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'draw test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
   '23:59', 'UTC', 'lottery', '30 days', 4, 'approved');
create temp table draw_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f7'
    and starts_at > now() order by starts_at limit 1;
grant select on draw_night to public;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from draw_night;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select count(*) from draw_lottery((select id from draw_night));

reset role;
select is(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000031'
     and body = 'You were drawn! You are on the list. You are number 1.'),
  1,
  'the draw tells a performer their number, not just that they are on'
);
select is(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000031'
     and payload ->> 'occurrence_id' = (select id::text from draw_night)),
  2,
  'the draw adds exactly one push on top of the entry receipt'
);
select is(
  (select payload ->> 'slot_position' from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000031'
     and body like 'You were drawn%'),
  '1',
  'with the number in the payload, so a tap can open the right night'
);

-- A reorder moves people without changing status, so it needs its own notice.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select set_slot_order(
  (select id from night),
  array(
    select sg.id from signups sg
    where sg.occurrence_id = (select id from night)
      and sg.status = 'confirmed'
    order by sg.slot_position desc
  )
);

reset role;
select is(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000001'
     and body = 'The running order changed. You are number 2.'),
  1,
  'moving someone down the order tells them their new number'
);

-- Same order applied twice must not fire again: nothing moved.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select set_slot_order(
  (select id from night),
  array(
    select sg.id from signups sg
    where sg.occurrence_id = (select id from night)
      and sg.status = 'confirmed'
    order by sg.slot_position
  )
);
reset role;
select is(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000001'
     and body like 'The running order changed%'),
  1,
  'and a reorder that changes nothing sends nothing'
);

-- Opting out of signup updates has to hold for the new notice too. Since
-- 20260810000500 a draw closes its night to new entries, so this scenario
-- runs on the series' following night, where no draw has happened yet.
create temp table draw_night_two as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f7'
    and starts_at > now()
  order by starts_at offset 1 limit 1;
grant select on draw_night_two to public;
insert into notification_prefs (profile_id, signup_updates)
values ('00000000-0000-4000-a000-000000000032', false);
insert into signups (occurrence_id, performer_id)
values ((select id from draw_night_two), '00000000-0000-4000-a000-000000000032');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select count(*) from draw_lottery((select id from draw_night_two));
reset role;
select is(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000032'
     and payload ->> 'occurrence_id' = (select id::text from draw_night_two)),
  0,
  'someone who turned signup updates off gets no receipt and no number'
);

reset role;
select * from finish();
rollback;
