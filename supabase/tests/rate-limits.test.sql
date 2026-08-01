-- Rate limits on end-user write paths: reports, listing flags, claim
-- requests, and signups. The Nth call within the window succeeds, the
-- Nth+1 is blocked, and the counter resets once the window passes.
begin;
select plan(10);

-- ---------------------------------------------------------------------------
-- Reports: 5 per user per hour, full insert path.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$insert into reports (reporter_id, target_type, target_id, reason, details)
    select auth.uid(), 'series', '20000000-0000-4000-c000-000000000001',
           'spam', 'report ' || n
    from generate_series(1, 5) n$$,
  'reports: the first 5 in an hour are accepted'
);
select throws_ok(
  $$insert into reports (reporter_id, target_type, target_id, reason, details)
    values (auth.uid(), 'series', '20000000-0000-4000-c000-000000000001',
            'spam', 'one too many')$$,
  'P0010', null,
  'reports: the 6th in an hour is blocked'
);

-- ---------------------------------------------------------------------------
-- Listing flags: 5 per user per hour. One real insert, then the budget is
-- exhausted directly against the same key the trigger uses.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into listing_flags (series_id, flagger_id, reason)
    values ('20000000-0000-4000-c000-000000000001', auth.uid(), 'wrong_time')$$,
  'flags: a normal flag is accepted'
);
reset role;
select is(
  (select count(*)::int from (
     select private.rate_limit(
       'listing_flags:00000000-0000-4000-a000-000000000002', 5, interval '1 hour')
     from generate_series(1, 4)) t),
  4, 'flags: the rest of the hourly budget is consumed'
);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$insert into listing_flags (series_id, flagger_id, reason)
    values ('20000000-0000-4000-c000-000000000001', auth.uid(), 'wrong_cost')$$,
  'P0010', null,
  'flags: the 6th in an hour is blocked'
);

-- ---------------------------------------------------------------------------
-- Claim requests: 3 per user per day.
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int from (
     select private.rate_limit(
       'claim_requests:00000000-0000-4000-a000-000000000001', 3, interval '1 day')
     from generate_series(1, 3)) t),
  3, 'claims: the daily budget is consumed'
);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$insert into claim_requests (series_id, requester_id, evidence)
    values ('20000000-0000-4000-c000-000000000002', auth.uid(), 'I host this')$$,
  'P0010', null,
  'claims: the 4th in a day is blocked'
);

-- ---------------------------------------------------------------------------
-- Signups: 30 per user per day. Fixture: an open first-come night.
-- ---------------------------------------------------------------------------
reset role;
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000f1', 'rate limit venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values ('20000000-0000-4000-c000-0000000000f1', '10000000-0000-4000-b000-0000000000f1',
        '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
        'rate limit mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
        current_date - 7, '23:59', 'UTC', 'first_come', '30 days', 5, 'approved');
create temp table rl_occ as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f1'
    and starts_at > now() order by starts_at limit 1;
grant select on rl_occ to authenticated;

select is(
  (select count(*)::int from (
     select private.rate_limit(
       'signups:00000000-0000-4000-a000-000000000001', 30, interval '1 day')
     from generate_series(1, 30)) t),
  30, 'signups: the daily budget is consumed'
);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$insert into signups (occurrence_id, performer_id)
    values ((select id from rl_occ), auth.uid())$$,
  'P0010', null,
  'signups: the 31st in a day is blocked'
);

-- ---------------------------------------------------------------------------
-- The window resets: the same key allows calls again in the next window.
-- ---------------------------------------------------------------------------
reset role;
select is(
  private.rate_limit('reports:00000000-0000-4000-a000-000000000002', 5,
                     interval '1 hour', now() + interval '2 hours'),
  true, 'the report budget is back after the window passes'
);

select * from finish();
rollback;
