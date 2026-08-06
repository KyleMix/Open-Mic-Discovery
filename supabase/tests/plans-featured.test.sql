-- Attendance plans and featured artists.
--
-- The assertions that carry weight are the negative ones. A plan says where a
-- named person will be on a given night, which is more sensitive than a
-- favorite, so the tests below check that a stranger cannot read one and that
-- the producer's counts view returns nothing at all to someone who does not
-- run the mic. occurrence_attendance is SECURITY DEFINER, so its WHERE clause
-- is the only thing standing between a caller and every headcount in the
-- database.
begin;
select plan(16);

-- Fixture: a nightly first-come mic owned by p2 (demo_producer).
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000f1', 'plans venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000f1', '10000000-0000-4000-b000-0000000000f1',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'plans test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
   '23:59', 'UTC', 'first_come', '30 days', 20, 'approved');

-- A second account that is coming to watch, not to perform.
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000021', 'watcher@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000021', 'watcher', 'Wanda Watcher', 'Just Watching',
   'Seattle', 'WA', false, '1.0', 'approved');

create temp table night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f1'
    and starts_at > now() order by starts_at limit 1;
grant select on night to public;

-- A night that has already happened, for the "no plans for the past" check.
insert into mic_occurrences (id, series_id, local_date, starts_at, status)
values ('30000000-0000-4000-d000-0000000000f1', '20000000-0000-4000-c000-0000000000f1',
        current_date - 30, now() - interval '30 days', 'scheduled');

-- ---------------------------------------------------------------------------
-- A performer plans a night, and signs up for it too.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

insert into attendance_plans (occurrence_id, profile_id) select id, auth.uid() from night;
select is(
  (select count(*)::int from attendance_plans where occurrence_id = (select id from night)),
  1,
  'a performer can say they are going to an upcoming night'
);

select throws_ok(
  $$insert into attendance_plans (occurrence_id, profile_id)
    values ('30000000-0000-4000-d000-0000000000f1', auth.uid())$$,
  '42501',
  null,
  'but not to a night that has already happened'
);

insert into signups (occurrence_id, performer_id) select id, auth.uid() from night;

-- The Going tab is one row per night, not one per way of saying yes.
select is(
  (select count(*)::int from my_upcoming_nights where occurrence_id = (select id from night)),
  1,
  'a night planned and signed up for appears once in my_upcoming_nights'
);
select is(
  (select planning from my_upcoming_nights where occurrence_id = (select id from night)),
  true,
  'and carries the plan flag'
);
select is(
  (select signup_status from my_upcoming_nights where occurrence_id = (select id from night)),
  'confirmed'::signup_status,
  'and the signup status alongside it'
);
select is(
  (select venue_name from my_upcoming_nights where occurrence_id = (select id from night)),
  'plans venue',
  'with enough of the listing to render a card'
);

-- ---------------------------------------------------------------------------
-- The person who is only watching also counts toward the headcount.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000021","role":"authenticated"}', true);
insert into attendance_plans (occurrence_id, profile_id) select id, auth.uid() from night;

-- And sees only their own plan, never the other one on the same night.
select is(
  (select count(*)::int from attendance_plans where occurrence_id = (select id from night)),
  1,
  'a performer never sees who else is planning to attend'
);
select is(
  (select count(*)::int from my_upcoming_nights),
  1,
  'and my_upcoming_nights holds their nights only'
);

-- The counts view is the producer's, and it is definer, so this is the test
-- that matters most: a stranger asking for it gets nothing back.
select is(
  (select count(*)::int from occurrence_attendance),
  0,
  'someone who does not run the mic sees no headcounts at all'
);

-- ---------------------------------------------------------------------------
-- The producer sees the night they run.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

select is(
  (select plan_count::int from occurrence_attendance
   where occurrence_id = (select id from night)),
  2,
  'the producer sees everyone planning to attend'
);
select is(
  (select performer_plan_count::int from occurrence_attendance
   where occurrence_id = (select id from night)),
  1,
  'and how many of them are performers, which is what changes the running order'
);
select is(
  (select signup_count::int from occurrence_attendance
   where occurrence_id = (select id from night)),
  1,
  'and how many are on the list'
);

-- The roster names people by stage name. The private one is not in the view
-- at all, so no policy change can leak it later.
select is(
  (select count(*)::int from plan_roster where occurrence_id = (select id from night)),
  2,
  'the producer can see who is coming, by stage name'
);
select hasnt_column(
  'public', 'plan_roster', 'display_name',
  'plan_roster never exposes the private display name'
);

-- Public free text written by a producer goes through the same filter as the
-- rest. Occurrences carry no held state, so the write is refused outright.
select throws_ok(
  $$update mic_occurrences set featured_name = 'kys headliner'
    where id = (select id from night)$$,
  '23514',
  null,
  'a featured artist name that trips the content filter is refused'
);

select lives_ok(
  $$update mic_occurrences set featured_name = 'Nia Guest'
    where id = (select id from night)$$,
  'and a clean one is written'
);

reset role;
select * from finish();
rollback;
