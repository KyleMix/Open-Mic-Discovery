-- Every commit gets a receipt, people on a list get reminded, and a
-- waitlisted performer can see where they stand.
begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- Seed: one first-come mic (capacity 1) and one lottery mic, three
-- performers.
-- ---------------------------------------------------------------------------
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000f9', 'receipt venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');

insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000f9', '10000000-0000-4000-b000-0000000000f9',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'receipt walk-in mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
   current_date - 7, '23:59', 'UTC', 'first_come', '30 days', 1, 'approved'),
  ('20000000-0000-4000-c000-0000000000fa', '10000000-0000-4000-b000-0000000000f9',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'receipt lottery mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
   current_date - 7, '23:59', 'UTC', 'lottery', '30 days', 5, 'approved');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000051', 'rc1@t.local'),
  ('00000000-0000-4000-a000-000000000052', 'rc2@t.local'),
  ('00000000-0000-4000-a000-000000000053', 'rc3@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000051', 'rc_one', 'Rc One', 'Receipt One', 'Seattle', 'WA',
   true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000052', 'rc_two', 'Rc Two', 'Receipt Two', 'Seattle', 'WA',
   true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000053', 'rc_three', 'Rc Three', 'Receipt Three', 'Seattle',
   'WA', true, '1.0', 'approved');

create temp table walkin_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f9'
    and starts_at > now() order by starts_at limit 1;
create temp table lottery_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000fa'
    and starts_at > now() order by starts_at limit 1;
grant select on walkin_night, lottery_night to public;

-- ---------------------------------------------------------------------------
-- Receipts on insert: on the list, on the waitlist, in the draw.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000051","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from walkin_night;
insert into signups (occurrence_id, performer_id) select id, auth.uid() from lottery_night;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000052","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from walkin_night;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000053","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from walkin_night;
reset role;

select is(
  (select body from notification_outbox
   where kind = 'signup_status'
     and profile_id = '00000000-0000-4000-a000-000000000051'
     and payload ->> 'occurrence_id' = (select id::text from walkin_night)),
  'You are on the list. You are number 1.',
  'a confirming signup queues its receipt at insert'
);
select ok(
  (select body like 'You are on the waitlist.%' from notification_outbox
   where kind = 'signup_status'
     and profile_id = '00000000-0000-4000-a000-000000000052'),
  'a waitlisted signup says so honestly'
);
select ok(
  (select body like 'You are in the draw.%' from notification_outbox
   where kind = 'signup_status'
     and profile_id = '00000000-0000-4000-a000-000000000051'
     and payload ->> 'occurrence_id' = (select id::text from lottery_night)),
  'a draw entry names the draw, not a list it is not on'
);

-- ---------------------------------------------------------------------------
-- Waitlist rank: place in line by signup order, null when not waiting.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000052","role":"authenticated"}', true);
select is(
  (select my_waitlist_rank((select id from walkin_night))),
  1,
  'the first person waiting is first in line'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000053","role":"authenticated"}', true);
select is(
  (select my_waitlist_rank((select id from walkin_night))),
  2,
  'the second person waiting is second in line'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000051","role":"authenticated"}', true);
select is(
  (select my_waitlist_rank((select id from walkin_night))),
  null,
  'a confirmed performer has no waitlist rank'
);
reset role;

-- ---------------------------------------------------------------------------
-- Reminders: a show-day nudge inside the two-hour window, once.
-- ---------------------------------------------------------------------------
update mic_occurrences set starts_at = now() + interval '2 hours'
  where id = (select id from walkin_night);
select ok(
  (select private.queue_signup_reminders()) >= 1,
  'the show-day nudge queues for a night two hours out'
);
select ok(
  (select body like 'Tonight at %You are number 1.' from notification_outbox
   where kind = 'signup_reminder'
     and profile_id = '00000000-0000-4000-a000-000000000051'
     and payload ->> 'phase' = 'day_of'),
  'the nudge carries the time and the slot number'
);
select is(
  (select private.queue_signup_reminders()),
  0,
  'running the queue again queues nothing new'
);

-- A day out, the same night queues the day-before phase for listed
-- performers only (the waitlist and the draw pool are not "on tomorrow").
update mic_occurrences set starts_at = now() + interval '24 hours'
  where id = (select id from walkin_night);
select ok(
  (select private.queue_signup_reminders()) >= 1,
  'the day-before reminder queues for a night a day out'
);
select is(
  (select count(*)::int from notification_outbox
   where kind = 'signup_reminder'
     and payload ->> 'phase' = 'day_before'
     and profile_id in ('00000000-0000-4000-a000-000000000052',
                        '00000000-0000-4000-a000-000000000053')),
  0,
  'waitlisted performers get no day-before "you are on" reminder'
);

-- The favorite reminder waits for a civil local hour instead of queueing
-- at the first tick after midnight.
select ok(
  pg_get_functiondef('private.queue_favorite_reminders'::regproc) like '%extract(hour%',
  'favorite reminders are gated on the local hour'
);

select * from finish();
rollback;
