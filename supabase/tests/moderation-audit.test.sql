-- Every moderator action leaves an audit row (20260808000100).
-- The four in-app moderation paths each append to admin.audit_log with the
-- session as actor, and automation with no session appends nothing.
-- admin.audit_log is unreadable by the authenticated role (by design), so
-- each block acts as authenticated and then resets role to assert.
begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- moderate_content writes content.reject and content.approve rows
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select moderate_content('series', '20000000-0000-4000-c000-000000000002', false);
reset role;

select is(
  (select count(*)::int from admin.audit_log
    where action = 'content.reject'
      and target_type = 'series'
      and target_id = '20000000-0000-4000-c000-000000000002'
      and actor_id = '00000000-0000-4000-a000-000000000004'),
  1,
  'a takedown writes one content.reject audit row with the session as actor'
);
select is(
  (select before_state ->> 'moderation_status' from admin.audit_log
    where action = 'content.reject'
      and target_id = '20000000-0000-4000-c000-000000000002'),
  'approved',
  'the audit row carries the state the takedown replaced'
);

set local role authenticated;
select moderate_content('series', '20000000-0000-4000-c000-000000000002', true);
reset role;

select is(
  (select count(*)::int from admin.audit_log
    where action = 'content.approve'
      and target_id = '20000000-0000-4000-c000-000000000002'),
  1,
  'restoring the content writes a content.approve row rather than editing history'
);
select is(
  (select moderation_status from mic_series
    where id = '20000000-0000-4000-c000-000000000002'),
  'approved'::moderation_status,
  'and the moderation action itself still lands'
);

-- ---------------------------------------------------------------------------
-- resolve_flag writes flag.confirm / flag.dismiss rows
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into listing_flags (id, series_id, flagger_id, reason, details)
values ('40000000-0000-4000-e000-000000000001',
        '20000000-0000-4000-c000-000000000003', auth.uid(),
        'permanently_dead', 'The venue closed in June.');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select resolve_flag('40000000-0000-4000-e000-000000000001', true);
reset role;

select is(
  (select count(*)::int from admin.audit_log
    where action = 'flag.confirm'
      and target_type = 'listing_flag'
      and target_id = '40000000-0000-4000-e000-000000000001'),
  1,
  'confirming a flag writes one flag.confirm audit row'
);
select is(
  (select after_state ->> 'series_paused' from admin.audit_log
    where action = 'flag.confirm'
      and target_id = '40000000-0000-4000-e000-000000000001'),
  'true',
  'and the row records that the confirmation paused the listing'
);
select ok(
  not (select is_active from mic_series
        where id = '20000000-0000-4000-c000-000000000003'),
  'the confirmed dead listing really was paused'
);

-- ---------------------------------------------------------------------------
-- review_claim writes claim.approve, marked not reversible
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
insert into claim_requests (id, series_id, requester_id, evidence)
values ('40000000-0000-4000-e000-000000000002',
        '20000000-0000-4000-c000-000000000004', auth.uid(),
        'I host this night; the venue can confirm.');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select review_claim('40000000-0000-4000-e000-000000000002', true);
reset role;

select is(
  (select count(*)::int from admin.audit_log
    where action = 'claim.approve'
      and target_type = 'claim_request'
      and target_id = '40000000-0000-4000-e000-000000000002'),
  1,
  'approving an ownership claim writes one claim.approve audit row'
);
select ok(
  not (select reversible from admin.audit_log
        where action = 'claim.approve'
          and target_id = '40000000-0000-4000-e000-000000000002'),
  'an ownership handover is recorded as not reversible'
);

-- ---------------------------------------------------------------------------
-- Resolving a report by direct update writes a report.action row
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into reports (id, reporter_id, target_type, target_id, reason, details)
values ('40000000-0000-4000-e000-000000000003', auth.uid(), 'series',
        '20000000-0000-4000-c000-000000000004', 'harassment', 'Host was abusive.');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
update reports set status = 'actioned'
 where id = '40000000-0000-4000-e000-000000000003';
reset role;

select is(
  (select count(*)::int from admin.audit_log
    where action = 'report.action'
      and target_type = 'report'
      and target_id = '40000000-0000-4000-e000-000000000003'),
  1,
  'resolving a report as actioned writes one report.action audit row'
);
select is(
  (select after_state ->> 'target_type' from admin.audit_log
    where action = 'report.action'
      and target_id = '40000000-0000-4000-e000-000000000003'),
  'series',
  'the audit row names what the report was about'
);

-- ---------------------------------------------------------------------------
-- Automation with no session appends nothing (audit design decision 2)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into reports (id, reporter_id, target_type, target_id, reason, details)
values ('40000000-0000-4000-e000-000000000004', auth.uid(), 'series',
        '20000000-0000-4000-c000-000000000004', 'spam', 'Same listing five times.');
reset role;

select set_config('request.jwt.claims', '', true);
update reports set status = 'dismissed'
 where id = '40000000-0000-4000-e000-000000000004';
select is(
  (select count(*)::int from admin.audit_log
    where target_id = '40000000-0000-4000-e000-000000000004'),
  0,
  'a sessionless status change appends no audit row: automation is not a moderator'
);

select * from finish();
rollback;
