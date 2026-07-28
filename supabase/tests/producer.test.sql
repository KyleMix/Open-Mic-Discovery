-- Producer tool tests: confirmation stamping, future-occurrence
-- reconciliation on series edits, and the claim review workflow.
begin;
select plan(15);

-- ---------------------------------------------------------------------------
-- One-tap confirm is server-stamped and unforgeable.
-- p2 owns the Rusty Fret series (…0001).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

update mic_series set last_confirmed_at = '2001-01-01T00:00:00Z'
where id = '20000000-0000-4000-c000-000000000001';
select cmp_ok(
  (select last_confirmed_at from mic_series where id = '20000000-0000-4000-c000-000000000001'),
  '>', now() - interval '1 minute',
  'confirming stamps the server time, backdating is impossible'
);
select is(
  (select last_confirmed_by from mic_series where id = '20000000-0000-4000-c000-000000000001'),
  '00000000-0000-4000-a000-000000000002'::uuid,
  'and records who confirmed'
);

-- Non-owner confirm attempts touch zero rows (RLS).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
update mic_series set last_confirmed_at = now()
where id = '20000000-0000-4000-c000-000000000012';
select isnt(
  (select last_confirmed_by from mic_series where id = '20000000-0000-4000-c000-000000000012'),
  '00000000-0000-4000-a000-000000000001'::uuid,
  'a non-owner cannot confirm someone else''s listing'
);

-- ---------------------------------------------------------------------------
-- All-future edits reconcile the window. Work as postgres on a dedicated
-- series to control every variable.
-- ---------------------------------------------------------------------------
reset role;
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000e2', 'reconcile venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');
insert into mic_series (id, venue_id, title, disciplines, rrule, anchor_date, start_time,
                        timezone, signup_method, moderation_status)
values ('20000000-0000-4000-c000-0000000000e2', '10000000-0000-4000-b000-0000000000e2',
        'reconcile series', '{music}', 'FREQ=WEEKLY;BYDAY=TU', current_date - 30,
        '20:00', 'America/Los_Angeles', 'first_come', 'approved');

-- Cancel one future night and add a signup to another so both are protected.
create temp table protected as
select o.id, o.local_date, row_number() over (order by o.local_date) as rn
from mic_occurrences o
where o.series_id = '20000000-0000-4000-c000-0000000000e2'
  and o.local_date > current_date
order by o.local_date limit 2;
update mic_occurrences set status = 'cancelled', cancellation_note = 'dark night'
where id = (select id from protected where rn = 1);
insert into signups (occurrence_id, performer_id, status)
select id, '00000000-0000-4000-a000-000000000001', 'requested' from protected where rn = 2;

-- Change the local start time: future scheduled nights move to 21:30 local.
update mic_series set start_time = '21:30'
where id = '20000000-0000-4000-c000-0000000000e2';
select is(
  (select count(*)::int from mic_occurrences o
   where o.series_id = '20000000-0000-4000-c000-0000000000e2'
     and o.local_date > current_date
     and o.status = 'scheduled'
     and (o.starts_at at time zone 'America/Los_Angeles')::time <> '21:30'),
  0,
  'a time change moves every future scheduled night to the new local time'
);
select is(
  (select status from mic_occurrences where id = (select id from protected where rn = 1)),
  'cancelled'::occurrence_status,
  'the cancelled night stays cancelled through the edit'
);

-- Change the recurrence day: Tuesdays that nobody touched disappear,
-- Fridays appear, the cancelled night and the night with a signup survive.
update mic_series set rrule = 'FREQ=WEEKLY;BYDAY=FR'
where id = '20000000-0000-4000-c000-0000000000e2';
select is(
  (select count(*)::int from mic_occurrences o
   where o.series_id = '20000000-0000-4000-c000-0000000000e2'
     and o.local_date > current_date
     and extract(isodow from o.local_date) = 2
     and o.status = 'scheduled'
     and o.cancellation_note is null
     and not exists (select 1 from signups sg where sg.occurrence_id = o.id)),
  0,
  'untouched future nights that no longer match the rule are removed'
);
select cmp_ok(
  (select count(*)::int from mic_occurrences o
   where o.series_id = '20000000-0000-4000-c000-0000000000e2'
     and o.local_date > current_date
     and extract(isodow from o.local_date) = 5),
  '>', 8,
  'nights matching the new rule are generated'
);
select is(
  (select count(*)::int from mic_occurrences where id in (select id from protected)),
  2,
  'the cancelled night and the night with a signup both survive a rule change'
);

-- Deactivation clears untouched future nights only.
update mic_series set is_active = false
where id = '20000000-0000-4000-c000-0000000000e2';
select is(
  (select count(*)::int from mic_occurrences o
   where o.series_id = '20000000-0000-4000-c000-0000000000e2'
     and o.local_date > current_date),
  2,
  'deactivating clears the future window except protected nights'
);

-- ---------------------------------------------------------------------------
-- Claim review workflow.
-- p1 (performer) claims the unclaimed Blue Heron series (…0002).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into claim_requests (series_id, requester_id, evidence)
values ('20000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001',
        'I have hosted this night since 2024, ask the counter staff.');

select throws_ok(
  $$select review_claim((select id from claim_requests
     where series_id = '20000000-0000-4000-c000-000000000002' and status = 'pending'), true)$$,
  '42501', 'only admins can review claims',
  'a non-admin cannot review claims'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$select review_claim((select id from claim_requests
     where series_id = '20000000-0000-4000-c000-000000000002' and status = 'pending'), true)$$,
  'an admin can approve a claim'
);
select is(
  (select owner_id from mic_series where id = '20000000-0000-4000-c000-000000000002'),
  '00000000-0000-4000-a000-000000000001'::uuid,
  'approval transfers ownership to the requester'
);
select is(
  (select is_producer from profiles where id = '00000000-0000-4000-a000-000000000001'),
  true,
  'approval grants the producer role'
);
select is(
  (select count(*)::int from producer_profiles
   where profile_id = '00000000-0000-4000-a000-000000000001'),
  1,
  'approval creates the producer profile row'
);

-- The new owner can now confirm their claimed listing.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
update mic_series set last_confirmed_at = now()
where id = '20000000-0000-4000-c000-000000000002';
select is(
  (select last_confirmed_by from mic_series where id = '20000000-0000-4000-c000-000000000002'),
  '00000000-0000-4000-a000-000000000001'::uuid,
  'the new owner can one-tap confirm their claimed mic'
);

select * from finish();
rollback;
