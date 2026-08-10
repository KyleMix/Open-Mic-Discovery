-- A committed night that moves or dies tells its list (20260810000800).
begin;
select plan(7);

insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000fc', 'tell venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');

insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000fc', '10000000-0000-4000-b000-0000000000fc',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'moving mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
   current_date - 7, '23:59', 'UTC', 'first_come', '30 days', 5, 'approved'),
  ('20000000-0000-4000-c000-0000000000fd', '10000000-0000-4000-b000-0000000000fc',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'dying mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
   current_date - 7, '23:59', 'UTC', 'lottery', '30 days', 2, 'approved');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000081', 'tell1@t.local'),
  ('00000000-0000-4000-a000-000000000082', 'tell2@t.local'),
  ('00000000-0000-4000-a000-000000000083', 'tell3@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000081', 'tell_one', 'Tell One', 'The Moved', 'Seattle',
   'WA', true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000082', 'tell_two', 'Tell Two', 'The Dropped', 'Seattle',
   'WA', true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000083', 'tell_three', 'Tell Three', 'The Losing', 'Seattle',
   'WA', true, '1.0', 'approved');

-- A performer commits to a night three days out on the moving mic.
create temp table moving_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000fc'
    and local_date = current_date + 3;
grant select on moving_night to public;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000081","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000081' from moving_night;

-- The host moves the start time for all future nights.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
update mic_series set start_time = '19:00'
  where id = '20000000-0000-4000-c000-0000000000fc';
reset role;

select is(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000081'
     and body like 'The start time changed%'),
  1,
  'a moved start time reaches the person on the list'
);
select ok(
  (select body like '%7:00 PM%' from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000081'
     and body like 'The start time changed%'),
  'and names the new mic-local time'
);
select is(
  (select count(*)::int from notification_outbox
   where body like 'The start time changed%'
     and profile_id <> '00000000-0000-4000-a000-000000000081'),
  0,
  'nobody off the list hears about it'
);

-- Two names enter the dying mic's draw; capacity 2, so both would fit, but
-- the third arrives to lose.
create temp table dying_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000fd'
    and starts_at > now() order by starts_at limit 1;
grant select on dying_night to public;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000081","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000081' from dying_night;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000082","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000082' from dying_night;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000083","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000083' from dying_night;

-- The draw runs: two drawn, one waitlisted, and the loser is told the truth.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select count(*) from draw_lottery((select id from dying_night));
reset role;

select is(
  (select count(*)::int from notification_outbox
   where body like 'The draw ran and your name did not come up%'),
  1,
  'the draw''s losing branch is worded as losing the draw'
);
select is(
  (select count(*)::int from notification_outbox
   where body like 'You were drawn!%'),
  2,
  'while the winners hear they won'
);

-- The listing dies with people committed: the night cancels and the push
-- that already exists for cancellations carries the news.
update mic_series
set deleted_at = now()
where id = '20000000-0000-4000-c000-0000000000fd';

select is(
  (select status::text from mic_occurrences where id = (select id from dying_night)),
  'cancelled',
  'a deleted listing cancels its committed nights'
);
select ok(
  (select count(*)::int from notification_outbox
   where kind = 'occurrence_cancelled'
     and payload ->> 'occurrence_id' = (select id::text from dying_night)) >= 3,
  'and everyone on the list is told'
);

select * from finish();
rollback;
