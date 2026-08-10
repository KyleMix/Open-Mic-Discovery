-- The draw is the moment the list becomes the list.
--
-- Before 20260810000500, the draw could run with the window open and anyone
-- entering afterwards sat in requested forever: no re-draw, no notification,
-- no terminal state. Now a post-draw entry is refused with a message naming
-- the reason, a post-draw walk-in goes straight onto the list, the draw only
-- runs for lottery mics on scheduled nights, and signup_counts tells the
-- card how crowded the draw is and whether it ran.
begin;
select plan(10);

insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000f8', 'draw venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');

-- A capacity-2 lottery and a first-come control, both owned by the seeded
-- producer, both with wide-open windows.
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000f8', '10000000-0000-4000-b000-0000000000f8',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'draw test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
   current_date - 7, '23:59', 'UTC', 'lottery', '30 days', 2, 'approved'),
  ('20000000-0000-4000-c000-0000000000f9', '10000000-0000-4000-b000-0000000000f8',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'not a draw mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
   current_date - 7, '23:59', 'UTC', 'first_come', '30 days', 2, 'approved');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000061', 'draw1@t.local'),
  ('00000000-0000-4000-a000-000000000062', 'draw2@t.local'),
  ('00000000-0000-4000-a000-000000000063', 'draw3@t.local'),
  ('00000000-0000-4000-a000-000000000064', 'draw4@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000061', 'draw_one', 'Draw One', 'The First', 'Seattle',
   'WA', true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000062', 'draw_two', 'Draw Two', 'The Second', 'Seattle',
   'WA', true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000063', 'draw_three', 'Draw Three', 'The Third', 'Seattle',
   'WA', true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000064', 'draw_four', 'Draw Four', 'The Fourth', 'Seattle',
   'WA', true, '1.0', 'approved');

create temp table draw_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f8'
    and starts_at > now() order by starts_at limit 1;
create temp table fc_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f9'
    and starts_at > now() order by starts_at limit 1;
grant select on draw_night, fc_night to public;

-- Three names go into the draw.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000061","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000061' from draw_night;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000062","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000062' from draw_night;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000063","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000063' from draw_night;

reset role;
select results_eq(
  $$select entrants, draw_done from signup_counts((select id from draw_night))$$,
  $$values (3, false)$$,
  'before the draw the counts name three entrants and no draw yet'
);

-- The host cannot draw the first-come mic, and the draw runs on the lottery.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select draw_lottery((select id from fc_night))$$,
  '23514',
  null,
  'the draw refuses a mic that does not use one'
);
select lives_ok(
  $$select draw_lottery((select id from draw_night))$$,
  'the draw runs on the lottery night'
);

reset role;
select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from draw_night) and status = 'drawn'),
  2,
  'capacity many names were drawn'
);
select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from draw_night) and status = 'waitlisted'),
  1,
  'and the rest wait'
);
select results_eq(
  $$select entrants, draw_done from signup_counts((select id from draw_night))$$,
  $$values (0, true)$$,
  'after the draw the counts say so'
);

-- A performer arriving after the draw is told exactly why the door is shut.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000064","role":"authenticated"}', true);
select throws_ok(
  $$insert into signups (occurrence_id, performer_id)
    select id, '00000000-0000-4000-a000-000000000064' from draw_night$$,
  '42501',
  'The draw for this night has already run, so signups are closed.',
  'a post-draw entry is refused with the reason named'
);

-- A walk-in the host adds after the draw goes straight onto the list.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
insert into signups (occurrence_id, guest_name)
  select id, 'Door Name' from draw_night;
reset role;
select is(
  (select status::text from signups
   where occurrence_id = (select id from draw_night) and guest_name = 'Door Name'),
  'waitlisted',
  'a post-draw walk-in lands honestly: the two drawn names hold the spots'
);

-- With a spot free the next walk-in is confirmed with the next number.
update signups set status = 'no_show'
  where occurrence_id = (select id from draw_night)
    and performer_id = (select performer_id from signups
                        where occurrence_id = (select id from draw_night)
                          and slot_position = 2);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
insert into signups (occurrence_id, guest_name)
  select id, 'Second Door' from draw_night;
reset role;
select is(
  (select (status, slot_position)::text from signups
   where occurrence_id = (select id from draw_night) and guest_name = 'Second Door'),
  '(confirmed,3)',
  'a walk-in after a freed spot is confirmed with the next number'
);

-- A cancelled night has nothing to draw.
update mic_occurrences set status = 'cancelled'
  where id = (select id from fc_night);
update mic_series set signup_method = 'lottery'
  where id = '20000000-0000-4000-c000-0000000000f9';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select draw_lottery((select id from fc_night))$$,
  '23514',
  null,
  'a cancelled night refuses the draw'
);

select * from finish();
rollback;
