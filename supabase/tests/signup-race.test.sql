-- The last slot goes to exactly one person, promotions carry a number, and
-- a freed spot reaches the host.
--
-- The race itself (two connections inserting at once) cannot run inside a
-- single pgTAP transaction, so the serialization is pinned two ways: the
-- lifecycle function must take the per-occurrence advisory lock (checked
-- against its source, the same style as rls-performance.test.sql), and the
-- unique constraint makes a duplicate slot number impossible at commit even
-- if some future edit drops the lock.
begin;
select plan(14);

-- ---------------------------------------------------------------------------
-- The guards exist.
-- ---------------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'signups_slot_position_unique' and contype = 'u' and condeferrable
  ),
  'slot numbers are unique per night, deferrable for reorders'
);
select ok(
  pg_get_functiondef('private.signup_lifecycle'::regproc) like '%pg_advisory_xact_lock%',
  'the lifecycle capacity check serializes per occurrence'
);

-- ---------------------------------------------------------------------------
-- Seed: a capacity-1 walk-in mic owned by the seeded producer, three
-- performers.
-- ---------------------------------------------------------------------------
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000e1', 'race venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');

insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values ('20000000-0000-4000-c000-0000000000e1', '10000000-0000-4000-b000-0000000000e1',
        '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
        'race test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
        current_date - 7, '23:59', 'UTC', 'first_come', '30 days', 1, 'approved');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000041', 'race1@t.local'),
  ('00000000-0000-4000-a000-000000000042', 'race2@t.local'),
  ('00000000-0000-4000-a000-000000000043', 'race3@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000041', 'race_one', 'Race One', 'The First', 'Seattle', 'WA',
   true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000042', 'race_two', 'Race Two', 'The Second', 'Seattle', 'WA',
   true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000043', 'race_three', 'Race Three', 'The Third', 'Seattle',
   'WA', true, '1.0', 'approved');

create temp table race_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000e1'
    and starts_at > now() order by starts_at limit 1;
grant select on race_night to public;

-- ---------------------------------------------------------------------------
-- Capacity 1: first signup confirms with slot 1, the next two waitlist.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000041","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from race_night;
select is(
  (select (status, slot_position)::text from signups
   where occurrence_id = (select id from race_night)
     and performer_id = '00000000-0000-4000-a000-000000000041'),
  '(confirmed,1)',
  'the first signup takes the only spot with slot 1'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000042","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from race_night;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000043","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from race_night;
reset role;
select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from race_night) and status = 'waitlisted'),
  2,
  'past capacity, signups land on the waitlist'
);

-- ---------------------------------------------------------------------------
-- A confirmed performer withdrawing queues one spot_opened push for the
-- owner, naming how many are waiting.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000041","role":"authenticated"}', true);
delete from signups
  where occurrence_id = (select id from race_night) and performer_id = auth.uid();
reset role;

select is(
  (select count(*)::int from notification_outbox
   where kind = 'spot_opened'
     and profile_id = '00000000-0000-4000-a000-000000000002'),
  1,
  'the owner is told a spot opened'
);
select ok(
  (select body like '%2 people are on the waitlist%' from notification_outbox
   where kind = 'spot_opened' limit 1),
  'the push names how many are waiting'
);
select is(
  (select payload->>'occurrence_id' from notification_outbox
   where kind = 'spot_opened' limit 1),
  (select id::text from race_night),
  'the push routes to the night it is about'
);

-- ---------------------------------------------------------------------------
-- Promotion off the waitlist assigns the next slot number immediately.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
update signups set status = 'confirmed'
  where occurrence_id = (select id from race_night)
    and performer_id = '00000000-0000-4000-a000-000000000042';
select is(
  (select slot_position::int from signups
   where occurrence_id = (select id from race_night)
     and performer_id = '00000000-0000-4000-a000-000000000042'),
  1,
  'a promoted performer gets a slot number without a manual reorder'
);

-- Undo flows keep the slot they hold rather than re-assigning.
update signups set status = 'performed'
  where occurrence_id = (select id from race_night)
    and performer_id = '00000000-0000-4000-a000-000000000042';
update signups set status = 'confirmed'
  where occurrence_id = (select id from race_night)
    and performer_id = '00000000-0000-4000-a000-000000000042';
select is(
  (select slot_position::int from signups
   where occurrence_id = (select id from race_night)
     and performer_id = '00000000-0000-4000-a000-000000000042'),
  1,
  'undoing performed keeps the same slot'
);

-- ---------------------------------------------------------------------------
-- System paths (no auth context) clean rows up without pinging the host.
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
delete from signups
  where occurrence_id = (select id from race_night)
    and performer_id = '00000000-0000-4000-a000-000000000042';
select is(
  (select count(*)::int from notification_outbox where kind = 'spot_opened'),
  1,
  'a system-side removal queues nothing, even with people waiting'
);

-- ---------------------------------------------------------------------------
-- The owner removing a walk-in themselves is not news to the owner: no
-- push, even though the guest held a confirmed spot and somebody waits.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
insert into signups (occurrence_id, guest_name)
  select id, 'Door Name' from race_night;
reset role;
select is(
  (select (status, slot_position)::text from signups
   where occurrence_id = (select id from race_night) and guest_name = 'Door Name'),
  '(confirmed,1)',
  'a walk-in fills the freed spot through the same lifecycle'
);
set local role authenticated;
delete from signups
  where occurrence_id = (select id from race_night) and guest_name = 'Door Name';
reset role;
select is(
  (select count(*)::int from notification_outbox where kind = 'spot_opened'),
  1,
  'an owner-made removal queues nothing new'
);

-- ---------------------------------------------------------------------------
-- The constraint has teeth: a duplicate slot number cannot be held.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000041","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from race_night;
reset role;
select is(
  (select (status, slot_position)::text from signups
   where occurrence_id = (select id from race_night)
     and performer_id = '00000000-0000-4000-a000-000000000041'),
  '(confirmed,1)',
  'with the spot free again, a fresh signup confirms at slot 1'
);
-- The constraint defers to commit for reorders; pgTAP rolls back instead of
-- committing, so force the check immediate to observe the rejection.
set constraints signups_slot_position_unique immediate;
select throws_ok(
  $$ update signups set slot_position = 1
     where occurrence_id = (select id from race_night)
       and performer_id = '00000000-0000-4000-a000-000000000043' $$,
  '23505',
  null,
  'two rows cannot hold the same slot'
);

select * from finish();
rollback;
