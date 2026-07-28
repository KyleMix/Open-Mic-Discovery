-- Signup lifecycle, lottery, reorder, and notification outbox tests.
begin;
select plan(14);

-- Test fixture: a first-come night with capacity 2 and a lottery night,
-- both owned by p2, happening within the open signup window.
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000e3', 'signup venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000e3', '10000000-0000-4000-b000-0000000000e3',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'fc test', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
   '23:59', 'UTC', 'first_come', '30 days', 2, 'approved'),
  ('20000000-0000-4000-c000-0000000000e4', '10000000-0000-4000-b000-0000000000e3',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'lottery test', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
   '23:59', 'UTC', 'lottery', '30 days', 2, 'approved');

-- Three performer accounts (p1 exists; add two more).
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000011', 'x1@t.local'),
  ('00000000-0000-4000-a000-000000000012', 'x2@t.local');
insert into profiles (id, handle, display_name, is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000011', 'perf_two', 'Perf Two', true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000012', 'perf_three', 'Perf Three', true, '1.0', 'approved');

create temp table fc_occ as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000e3'
    and starts_at > now() order by starts_at limit 1;
create temp table lot_occ as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000e4'
    and starts_at > now() order by starts_at limit 1;
grant select on fc_occ, lot_occ to public;

-- ---------------------------------------------------------------------------
-- First-come lifecycle
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
select id, auth.uid() from fc_occ;
select is(
  (select status from signups where occurrence_id = (select id from fc_occ)
   and performer_id = auth.uid()),
  'confirmed'::signup_status,
  'first-come signup within capacity is confirmed immediately'
);
select is(
  (select slot_position from signups where occurrence_id = (select id from fc_occ)
   and performer_id = auth.uid()),
  1::smallint,
  'and takes the next slot position'
);

-- A performer cannot self-promote.
update signups set status = 'performed'
where occurrence_id = (select id from fc_occ) and performer_id = auth.uid();
select is(
  (select status from signups where occurrence_id = (select id from fc_occ)
   and performer_id = auth.uid()),
  'confirmed'::signup_status,
  'a performer cannot change their own status'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from fc_occ;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000012","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from fc_occ;
select is(
  (select status from signups where occurrence_id = (select id from fc_occ)
   and performer_id = auth.uid()),
  'waitlisted'::signup_status,
  'beyond capacity, first-come signups are waitlisted'
);

-- Withdraw works.
delete from signups where occurrence_id = (select id from fc_occ) and performer_id = auth.uid();
select is(
  (select count(*)::int from signups where occurrence_id = (select id from fc_occ)
   and performer_id = auth.uid()),
  0,
  'a performer can withdraw their own signup'
);

-- ---------------------------------------------------------------------------
-- Lottery
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from lot_occ;
select is(
  (select status from signups where occurrence_id = (select id from lot_occ)
   and performer_id = auth.uid()),
  'requested'::signup_status,
  'lottery signups wait as requested until the draw'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from lot_occ;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000012","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from lot_occ;

select throws_ok(
  $$select count(*) from draw_lottery((select id from lot_occ))$$,
  '42501', 'only the producer can draw this lottery',
  'a performer cannot draw the lottery'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::int from draw_lottery((select id from lot_occ))),
  3,
  'the owner draws and every name is assigned'
);
select is(
  (select count(*)::int from signups where occurrence_id = (select id from lot_occ)
   and status = 'drawn'),
  2,
  'capacity names are drawn with positions'
);
select is(
  (select count(*)::int from signups where occurrence_id = (select id from lot_occ)
   and status = 'waitlisted'),
  1,
  'the rest land on the waitlist'
);

-- Reorder is owner-only and atomic.
select lives_ok(
  $$select set_slot_order((select id from lot_occ),
     (select array_agg(id order by slot_position desc nulls last)
      from signups where occurrence_id = (select id from lot_occ) and status = 'drawn'))$$,
  'the owner can reorder the list'
);
select is(
  (select count(distinct slot_position)::int from signups
   where occurrence_id = (select id from lot_occ) and slot_position is not null),
  2,
  'positions stay unique after reorder'
);

-- Producer marks performed; the outbox records a status notification.
update signups set status = 'performed'
where occurrence_id = (select id from lot_occ)
  and performer_id = '00000000-0000-4000-a000-000000000001';
reset role;
select cmp_ok(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000001' and kind = 'signup_status'),
  '>=', 1,
  'status changes enqueue a push notification'
);
select is(
  (select count(*)::int from notification_outbox n where n.sent_at is not null),
  0,
  'outbox rows start unsent'
);

select * from finish();
rollback;
