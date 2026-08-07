-- Report triage: severity is derived, stamps are server owned, and the
-- moderator's side of a report is invisible to the person who filed it.
begin;
select plan(15);

-- ---------------------------------------------------------------------------
-- Severity comes from the reason, not from the client.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

insert into reports (id, reporter_id, target_type, target_id, reason, details)
values ('30000000-0000-4000-d000-000000000001', auth.uid(), 'profile',
        '00000000-0000-4000-a000-000000000003', 'violence_threat', 'threatened me');
select is(
  (select severity from reports where id = '30000000-0000-4000-d000-000000000001'),
  'urgent'::report_severity,
  'a threat of violence lands urgent'
);

insert into reports (id, reporter_id, target_type, target_id, reason, details)
values ('30000000-0000-4000-d000-000000000002', auth.uid(), 'series',
        '20000000-0000-4000-c000-000000000004', 'spam', 'posting the same mic ten times');
select is(
  (select severity from reports where id = '30000000-0000-4000-d000-000000000002'),
  'low'::report_severity,
  'spam lands low'
);

-- The forgery attempt: a reporter naming their own severity gets the derived
-- value anyway.
insert into reports (id, reporter_id, target_type, target_id, reason, details, severity)
values ('30000000-0000-4000-d000-000000000003', auth.uid(), 'series',
        '20000000-0000-4000-c000-000000000004', 'spam', 'me again', 'urgent');
select is(
  (select severity from reports where id = '30000000-0000-4000-d000-000000000003'),
  'low'::report_severity,
  'a client-supplied severity is overwritten by the derived one'
);

-- And a report cannot arrive pre-resolved, which would hide it from the queue.
insert into reports (id, reporter_id, target_type, target_id, reason, details,
                     resolved_by, resolved_at)
values ('30000000-0000-4000-d000-000000000004', auth.uid(), 'profile',
        '00000000-0000-4000-a000-000000000002', 'harassment', 'rude',
        '00000000-0000-4000-a000-000000000004', now());
select ok(
  (select resolved_by is null and resolved_at is null
     from reports where id = '30000000-0000-4000-d000-000000000004'),
  'a report cannot be filed already resolved'
);
select is(
  (select status from reports where id = '30000000-0000-4000-d000-000000000004'),
  'open'::report_status,
  'and the insert policy still pins the status to open'
);

-- ---------------------------------------------------------------------------
-- Resolution stamps come from the session, not the request body.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);

-- Admin 0004 resolves it while claiming someone else did.
update reports
set status = 'actioned',
    resolved_by = '00000000-0000-4000-a000-000000000001',
    resolved_at = '2020-01-01T00:00:00Z'
where id = '30000000-0000-4000-d000-000000000001';
select is(
  (select resolved_by from reports where id = '30000000-0000-4000-d000-000000000001'),
  '00000000-0000-4000-a000-000000000004'::uuid,
  'resolved_by is stamped from the session, not from the claim in the body'
);
select ok(
  (select resolved_at > '2021-01-01T00:00:00Z'
     from reports where id = '30000000-0000-4000-d000-000000000001'),
  'and resolved_at is stamped from the clock'
);

-- Reopening clears a decision that no longer stands.
update reports set status = 'in_review'
where id = '30000000-0000-4000-d000-000000000001';
select ok(
  (select resolved_by is null and resolved_at is null
     from reports where id = '30000000-0000-4000-d000-000000000001'),
  'reopening a report clears the resolution stamps'
);

-- A later edit to an already-resolved report does not rewrite who decided it.
update reports set status = 'actioned' where id = '30000000-0000-4000-d000-000000000002';
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
update reports set severity = 'normal' where id = '30000000-0000-4000-d000-000000000002';
select is(
  (select resolved_by from reports where id = '30000000-0000-4000-d000-000000000002'),
  '00000000-0000-4000-a000-000000000004'::uuid,
  'a later edit by a second admin does not rewrite the original resolver'
);
select is(
  (select severity from reports where id = '30000000-0000-4000-d000-000000000002'),
  'normal'::report_severity,
  'while an admin can still re-rank an item'
);

-- ---------------------------------------------------------------------------
-- report_triage is moderator only. The reporter of a report must not be able
-- to read the note written about it, which is the reason it is not a column on
-- reports.
-- ---------------------------------------------------------------------------
insert into report_triage (report_id, assigned_to, resolution)
values ('30000000-0000-4000-d000-000000000001',
        '00000000-0000-4000-a000-000000000004',
        'Warned the account. Known repeat offender, watch the next one.');
select is(
  (select count(*)::int from report_triage
    where report_id = '30000000-0000-4000-d000-000000000001'),
  1,
  'an admin can write and read triage'
);

-- 0001 filed that report and can still read their own report row.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::int from reports where id = '30000000-0000-4000-d000-000000000001'),
  1,
  'the reporter can still read their own report'
);
select is(
  (select count(*)::int from report_triage
    where report_id = '30000000-0000-4000-d000-000000000001'),
  0,
  'but sees nothing of the moderator note attached to it'
);
reset role;

-- No path deletes triage: no policy, and no grant either. The grant half
-- matters because 20260728001200 grants all on new public tables by default.
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'report_triage' and cmd = 'DELETE'),
  0,
  'no delete policy exists on report_triage'
);
select ok(
  not has_table_privilege('authenticated', 'report_triage', 'DELETE')
  and not has_table_privilege('anon', 'report_triage', 'SELECT'),
  'and the default privileges were revoked: no delete for authenticated, nothing for anon'
);

select * from finish();
rollback;
