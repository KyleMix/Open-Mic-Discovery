-- What discovery admits and what it hides, after 20260810000700: a called
-- off next night is carried on the card row instead of silently skipped,
-- and blocking a host removes their mics from the blocker's feed while
-- changing nothing for anyone else.
begin;
select plan(6);

insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000fa', 'truth venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000071', 'blocker@t.local'),
  ('00000000-0000-4000-a000-000000000072', 'blockedhost@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, is_producer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000071', 'truth_perf', 'Truth Perf', 'The Peeved', 'Seattle',
   'WA', true, false, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000072', 'truth_host', 'Truth Host', 'The Blocked', 'Seattle',
   'WA', false, true, '1.0', 'approved');
insert into producer_profiles (profile_id)
values ('00000000-0000-4000-a000-000000000072');

insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000fa', '10000000-0000-4000-b000-0000000000fa',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'cancelled next test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
   current_date - 7, '23:59', 'UTC', 'first_come', 'approved'),
  ('20000000-0000-4000-c000-0000000000fb', '10000000-0000-4000-b000-0000000000fa',
   '00000000-0000-4000-a000-000000000072', '00000000-0000-4000-a000-000000000072',
   'blocked host test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
   current_date - 7, '23:59', 'UTC', 'first_come', 'approved');

-- Call off the imminent night of the first mic.
create temp table cancelled_night as
  select id, starts_at from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000fa'
    and starts_at > now() order by starts_at limit 1;
grant select on cancelled_night to public;
update mic_occurrences set status = 'cancelled'
  where id = (select id from cancelled_night);

-- A guest browsing sees the cancellation carried on the row, with the
-- following night as the headline.
set local role anon;
select is(
  (select cancelled_next_starts_at from search_discover()
   where series_id = '20000000-0000-4000-c000-0000000000fa'),
  (select starts_at from cancelled_night),
  'the called-off night rides on the card row'
);
select ok(
  (select next_starts_at > (select starts_at from cancelled_night) from search_discover()
   where series_id = '20000000-0000-4000-c000-0000000000fa'),
  'while the headline night is the next one still on'
);
select is(
  (select cancelled_next_starts_at from search_discover()
   where series_id = '20000000-0000-4000-c000-0000000000fb'),
  null::timestamptz,
  'a mic with nothing called off carries nothing'
);
reset role;

-- The performer blocks the second mic's host.
insert into blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-a000-000000000071', '00000000-0000-4000-a000-000000000072');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000071","role":"authenticated"}', true);
select is(
  (select count(*)::int from search_discover()
   where series_id = '20000000-0000-4000-c000-0000000000fb'),
  0,
  'a blocked host''s mic leaves the blocker''s feed'
);
select is(
  (select count(*)::int from search_discover()
   where series_id = '20000000-0000-4000-c000-0000000000fa'),
  1,
  'while everyone else''s mics stay'
);

-- Everyone else still sees the blocked host's mic.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::int from search_discover()
   where series_id = '20000000-0000-4000-c000-0000000000fb'),
  1,
  'a guest''s feed is unchanged by someone else''s block'
);
reset role;

select * from finish();
rollback;
