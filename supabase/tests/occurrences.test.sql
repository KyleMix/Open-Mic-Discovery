-- Occurrence generator tests: recurrence correctness, DST safety,
-- idempotency, and override/cancellation preservation.
begin;
select plan(23);

-- A dedicated test series: every Tuesday 20:00 America/Los_Angeles.
-- The 130-day horizon from late July 2026 crosses the US DST fall-back
-- (November 1, 2026), which is exactly what we need to prove local-time
-- correctness.
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000e1'::uuid, 'tz test venue', 'x', 'Seattle', 'WA',
        'POINT(-122.33 47.60)', 'approved');

select lives_ok(
  $$insert into mic_series (id, venue_id, title, disciplines, rrule, anchor_date,
                            start_time, timezone, signup_method, moderation_status)
    values ('20000000-0000-4000-c000-0000000000e1'::uuid,
            '10000000-0000-4000-b000-0000000000e1'::uuid,
            'tz test series', '{music}', 'FREQ=WEEKLY;BYDAY=TU', '2026-07-07',
            '20:00', 'America/Los_Angeles', 'first_come', 'approved')$$,
  'series insert triggers occurrence generation'
);

select private.generate_occurrences('20000000-0000-4000-c000-0000000000e1'::uuid, 130);

-- All generated dates are Tuesdays.
select is(
  (select count(*)::int from mic_occurrences
   where series_id = '20000000-0000-4000-c000-0000000000e1'::uuid
     and extract(isodow from local_date) <> 2),
  0,
  'weekly BYDAY=TU generates only Tuesdays'
);

-- DST: 20:00 local is 03:00 UTC next day during PDT, 04:00 UTC during PST.
select is(
  (select starts_at from mic_occurrences
   where series_id = '20000000-0000-4000-c000-0000000000e1'::uuid
     and local_date = '2026-10-27'),
  '2026-10-28 03:00:00+00'::timestamptz,
  'before fall-back: 20:00 PDT is 03:00 UTC'
);
select is(
  (select starts_at from mic_occurrences
   where series_id = '20000000-0000-4000-c000-0000000000e1'::uuid
     and local_date = '2026-11-03'),
  '2026-11-04 04:00:00+00'::timestamptz,
  'after fall-back: 20:00 PST is 04:00 UTC, local time is preserved'
);

-- Idempotency: rerunning the generator adds nothing and changes nothing.
create temp table occ_before as
  select id, starts_at, status from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000e1'::uuid;
select is(
  private.generate_occurrences('20000000-0000-4000-c000-0000000000e1'::uuid, 130),
  0,
  'regeneration inserts zero rows'
);
select bag_eq(
  $$select id, starts_at, status from mic_occurrences
    where series_id = '20000000-0000-4000-c000-0000000000e1'::uuid$$,
  $$select id, starts_at, status from occ_before$$,
  'regeneration leaves existing occurrences untouched'
);

-- Cancellations survive regeneration.
-- The night to cancel is picked dynamically: a hardcoded date only exists
-- while it is still inside the generator's from-today horizon.
create temp table cancel_target as
  select local_date from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000e1'::uuid
    and local_date >= current_date
  order by local_date limit 1;
update mic_occurrences set status = 'cancelled', cancellation_note = 'venue flooded'
where series_id = '20000000-0000-4000-c000-0000000000e1'::uuid
  and local_date = (select local_date from cancel_target);
select private.generate_occurrences('20000000-0000-4000-c000-0000000000e1'::uuid, 130);
select is(
  (select status from mic_occurrences
   where series_id = '20000000-0000-4000-c000-0000000000e1'::uuid
     and local_date = (select local_date from cancel_target)),
  'cancelled'::occurrence_status,
  'a cancelled night is never clobbered by the generator'
);
select is(
  (select count(*)::int from mic_occurrences
   where series_id = '20000000-0000-4000-c000-0000000000e1'::uuid
     and local_date = (select local_date from cancel_target)),
  1,
  'and no duplicate is created for that date'
);

-- Biweekly parity: consecutive dates are exactly 14 days apart.
select is(
  (select count(distinct diff)::int from (
     select local_date - lag(local_date) over (order by local_date) as diff
     from mic_occurrences
     where series_id = '20000000-0000-4000-c000-000000000004'
   ) d where diff is not null),
  1,
  'biweekly series has a single consistent gap'
);
select is(
  (select min(diff)::int from (
     select local_date - lag(local_date) over (order by local_date) as diff
     from mic_occurrences
     where series_id = '20000000-0000-4000-c000-000000000004'
   ) d where diff is not null),
  14,
  'and that gap is 14 days'
);

-- Monthly ordinals: 1FR is always the first Friday.
select is(
  (select count(*)::int from mic_occurrences
   where series_id = '20000000-0000-4000-c000-000000000005'
     and (extract(isodow from local_date) <> 5 or extract(day from local_date) > 7)),
  0,
  'FREQ=MONTHLY;BYDAY=1FR generates only first Fridays'
);

-- Monthly negative ordinal: -1TH is always the last Thursday.
select is(
  (select count(*)::int from mic_occurrences o
   where o.series_id = '20000000-0000-4000-c000-000000000018'
     and (extract(isodow from o.local_date) <> 4
          or o.local_date + 7 <= (date_trunc('month', o.local_date)
                                  + interval '1 month' - interval '1 day')::date)),
  0,
  'FREQ=MONTHLY;BYDAY=-1TH generates only last Thursdays'
);

-- Invalid timezone is rejected at the boundary.
select throws_ok(
  $$insert into mic_series (venue_id, title, disciplines, rrule, anchor_date,
                            start_time, timezone, signup_method)
    values ('10000000-0000-4000-b000-0000000000e1'::uuid, 'bad tz', '{music}',
            'FREQ=WEEKLY;BYDAY=MO', '2026-01-01', '19:00', 'PST', 'first_come')$$,
  'P0001', 'invalid IANA timezone: PST',
  'non-IANA timezone names are rejected'
);

-- ---------------------------------------------------------------------------
-- Unsupported recurrence rules are rejected at the same boundary
-- (20260807000700, audit finding F-015).
--
-- rrule_matches implements a subset on purpose. What it used to do with
-- anything outside that subset was return false for every candidate day, so
-- the listing saved cleanly and then generated no nights, forever, with no
-- error anywhere. These are the shapes that took that path.
-- ---------------------------------------------------------------------------
create function pg_temp.try_rrule(p_rrule text) returns text language plpgsql as $fn$
begin
  insert into mic_series (venue_id, title, disciplines, rrule, anchor_date,
                          start_time, timezone, signup_method)
  values ('10000000-0000-4000-b000-0000000000e1'::uuid, 'rrule probe', '{music}',
          p_rrule, '2026-01-01', '19:00', 'America/Los_Angeles', 'first_come');
  return 'accepted';
exception when others then
  return sqlstate;
end;
$fn$;

-- The silent-nothing case: a monthly rule with no ordinal on the weekday.
select is(pg_temp.try_rrule('FREQ=MONTHLY;BYDAY=TU'), '23514',
  'a monthly rule with a plain weekday is refused, not accepted and then ignored');

-- The wrong-cadence case: the monthly branch has no INTERVAL support, so
-- accepting one promises an every-other-month mic and delivers monthly.
select is(pg_temp.try_rrule('FREQ=MONTHLY;INTERVAL=2;BYDAY=1TU'), '23514',
  'a monthly rule with an INTERVAL is refused rather than quietly run monthly');

select is(pg_temp.try_rrule('FREQ=DAILY;BYDAY=MO'), '23514',
  'a frequency the generator does not implement is refused');
select is(pg_temp.try_rrule('FREQ=WEEKLY;BYDAY='), '23514',
  'a rule with no days at all is refused');
select is(pg_temp.try_rrule('FREQ=WEEKLY;BYDAY=FUNDAY'), '23514',
  'a weekday that is not one is refused');
select is(pg_temp.try_rrule('FREQ=WEEKLY;INTERVAL=0;BYDAY=MO'), '23514',
  'an INTERVAL of zero is refused rather than dividing by it');

-- And the whole supported subset still saves, which is the assertion that
-- stops the guard from being tightened into a wall.
select is(pg_temp.try_rrule('FREQ=WEEKLY;BYDAY=TU,FR'), 'accepted',
  'multi-day weekly rules are still accepted');
select is(pg_temp.try_rrule('FREQ=WEEKLY;INTERVAL=3;BYDAY=WE'), 'accepted',
  'every-n-weeks rules are still accepted');
select is(pg_temp.try_rrule('FREQ=MONTHLY;BYDAY=1SU,3SU'), 'accepted',
  'multi-ordinal monthly rules are still accepted');
select is(pg_temp.try_rrule('FREQ=MONTHLY;BYDAY=-1FR'), 'accepted',
  'last-weekday-of-month rules are still accepted');

select * from finish();
rollback;
