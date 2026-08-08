-- Sanctions, and whether a ban actually stops anybody.
--
-- A note on shape, because it caught me out and it is a real difference. An
-- INSERT that fails a WITH CHECK policy RAISES 42501. An UPDATE or DELETE that
-- fails a USING policy silently affects zero rows, because USING filters rather
-- than rejects. So insert attempts below are throws_ok and update attempts are
-- row counts, and mixing the two up makes a test that passes for the wrong
-- reason.
--
-- Seed fixture: 0005 owner, 0004 moderator, 0001 performer, 0002 producer
-- (owns listings), 0003 dual (performs and hosts).
begin;
select plan(48);

-- ---------------------------------------------------------------------------
-- The table is readable by its subject and writable by nobody.
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'user_sanctions', 'INSERT')
  and not has_table_privilege('authenticated', 'user_sanctions', 'UPDATE')
  and not has_table_privilege('authenticated', 'user_sanctions', 'DELETE')
  and has_table_privilege('authenticated', 'user_sanctions', 'SELECT'),
  'authenticated may read the table and never write it, whatever RLS says'
);
select ok(
  not has_table_privilege('anon', 'user_sanctions', 'SELECT'),
  'anon holds nothing on it'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'user_sanctions'
     and cmd in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'and there is no write policy either: the two RPCs are the only writer'
);

-- ---------------------------------------------------------------------------
-- The predicate. Rows are inserted directly here, as the table owner, so the
-- expiry and lifted cases can be set up without waiting for a clock.
-- ---------------------------------------------------------------------------
insert into user_sanctions (id, user_id, type, scope, reason, expires_at, created_by)
values
  ('40000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001',
   'warned', 'all_writes', 'First warning about roster behaviour.', null,
   '00000000-0000-4000-a000-000000000004'),
  ('40000000-0000-4000-e000-000000000002', '00000000-0000-4000-a000-000000000003',
   'suspended', 'signups', 'Three no-shows in a month.',
   now() - interval '1 day', '00000000-0000-4000-a000-000000000004');

select ok(
  not private.is_sanctioned('00000000-0000-4000-a000-000000000001', 'signups'),
  'a warning restricts nothing: it is a record, not a punishment'
);
select ok(
  not private.is_sanctioned('00000000-0000-4000-a000-000000000003', 'signups'),
  'and a suspension whose end date has passed no longer bites'
);

update user_sanctions set expires_at = now() + interval '7 days'
where id = '40000000-0000-4000-e000-000000000002';
select ok(
  private.is_sanctioned('00000000-0000-4000-a000-000000000003', 'signups'),
  'a live suspension does'
);
select ok(
  not private.is_sanctioned('00000000-0000-4000-a000-000000000003', 'listings'),
  'and only for the capability it names: a signups scope leaves hosting alone'
);
select ok(
  not private.is_banned('00000000-0000-4000-a000-000000000003'),
  'a suspension is not a ban'
);

update user_sanctions set scope = 'all_writes'
where id = '40000000-0000-4000-e000-000000000002';
select ok(
  private.is_sanctioned('00000000-0000-4000-a000-000000000003', 'listings')
  and private.is_sanctioned('00000000-0000-4000-a000-000000000003', 'reporting'),
  'an all_writes scope covers every capability'
);

update user_sanctions
set lifted_at = now(), lifted_by = '00000000-0000-4000-a000-000000000004',
    lift_reason = 'Appealed successfully.'
where id = '40000000-0000-4000-e000-000000000002';
select ok(
  not private.is_sanctioned('00000000-0000-4000-a000-000000000003', 'listings'),
  'and a lifted sanction stops biting immediately'
);
delete from user_sanctions
where id in ('40000000-0000-4000-e000-000000000001',
             '40000000-0000-4000-e000-000000000002');

-- ---------------------------------------------------------------------------
-- Who may sanction.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000002',
      'banned', 'all_writes', null, 'I do not like them', '203.0.113.7'::inet)$$,
  '42501', 'only a moderator or an owner can sanction an account',
  'a plain user cannot sanction anyone'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000004',
      'warned', 'all_writes', null, 'talking to myself', '203.0.113.7'::inet)$$,
  '42501', 'you cannot sanction yourself',
  'and a moderator cannot sanction themselves'
);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000005',
      'banned', 'all_writes', null, 'silencing the owner', '203.0.113.7'::inet)$$,
  '42501',
  'that account is an admin. Take their console access away first, with admin_set_active.',
  'and cannot sanction an admin, which is the escalation route this closes'
);

select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000001',
      'suspended', 'signups', null, 'no end date', '203.0.113.7'::inet)$$,
  '23514', 'a suspension needs an end date',
  'a suspension without an end date is refused'
);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000001',
      'suspended', 'signups', now() - interval '1 day', 'backdated',
      '203.0.113.7'::inet)$$,
  '23514', 'a suspension has to end in the future',
  'and so is one that ended yesterday'
);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000001',
      'banned', 'all_writes', now() + interval '1 day', 'temporary ban',
      '203.0.113.7'::inet)$$,
  '23514',
  'only a suspension carries an end date. A warning is a record and a ban runs until it is lifted.',
  'a ban with an end date is refused: that is a suspension'
);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000001',
      'shadowbanned', 'all_writes', null, 'inventing a type', '203.0.113.7'::inet)$$,
  '22P02', 'type must be warned, suspended or banned, not shadowbanned',
  'and a type outside the three is refused'
);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-0000000000ff',
      'warned', 'all_writes', null, 'nobody there', '203.0.113.7'::inet)$$,
  'P0002', 'no live account with that id',
  'sanctioning an account that does not exist is refused'
);
reset role;

-- ---------------------------------------------------------------------------
-- A suspension stops the thing it names and nothing else.
--
-- The control matters here: 0001 makes the same signup first, so a refusal for
-- 0003 can only be the sanction and not a closed window or a wrong fixture.
-- ---------------------------------------------------------------------------
create temp table target_occ as
  select o.id
    from mic_occurrences o
    join mic_series s on s.id = o.series_id
   where o.status = 'scheduled'
     and s.signup_method <> 'host_booked'
     and s.owner_id is distinct from '00000000-0000-4000-a000-000000000003'
     and s.owner_id is distinct from '00000000-0000-4000-a000-000000000001'
     and now() >= o.starts_at - s.signup_opens
     and now() <= o.starts_at - s.signup_closes
   order by o.starts_at
   limit 1;
grant select on target_occ to authenticated;
select cmp_ok(
  (select count(*)::int from target_occ), '>', 0,
  'the fixture has a night with an open signup window to try'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select lives_ok(
  format($$insert into signups (occurrence_id, performer_id) values (%L, %L)$$,
    (select id from target_occ), '00000000-0000-4000-a000-000000000001'),
  'an unsanctioned performer can sign up for it'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
create temp table s1 as select admin_sanction_apply(
  '00000000-0000-4000-a000-000000000003', 'suspended', 'signups',
  now() + interval '7 days',
  'Signed up for four mics in a week and turned up to none of them.',
  '203.0.113.7'::inet) as id;
grant select on s1 to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select throws_ok(
  format($$insert into signups (occurrence_id, performer_id) values (%L, %L)$$,
    (select id from target_occ), '00000000-0000-4000-a000-000000000003'),
  '42501', null,
  'and a signups suspension stops the suspended performer signing up for the same night'
);

select lives_ok(
  $$insert into reports (reporter_id, target_type, target_id, reason, details)
    values ('00000000-0000-4000-a000-000000000003', 'series',
            '20000000-0000-4000-c000-000000000004', 'spam', 'still allowed to report')$$,
  'while leaving reporting alone, because a narrow sanction is narrow'
);
reset role;

-- ---------------------------------------------------------------------------
-- A ban stops everything, hides the account, and pauses its listings.
--
-- One of the producer's listings is paused before the ban, to prove that
-- lifting the ban does not switch it back on.
-- ---------------------------------------------------------------------------
create temp table pre_paused as
  select id from mic_series
   where owner_id = '00000000-0000-4000-a000-000000000002' and is_active
   order by id limit 1;
update mic_series set is_active = false where id in (select id from pre_paused);

create temp table was_active as
  select id from mic_series
   where owner_id = '00000000-0000-4000-a000-000000000002'
     and is_active and deleted_at is null;
-- Created by the reset role, and read below from an authenticated session.
grant select on pre_paused, was_active to authenticated;
select cmp_ok(
  (select count(*)::int from was_active), '>', 0,
  'the producer still has live listings to ban them out of'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
create temp table s2 as select admin_sanction_apply(
  '00000000-0000-4000-a000-000000000002', 'banned', 'all_writes', null,
  'Repeated harassment of performers on their own rosters, three upheld reports.',
  '203.0.113.7'::inet) as id;
grant select on s2 to authenticated;
reset role;

select ok(
  private.is_banned('00000000-0000-4000-a000-000000000002'),
  'the ban is in force'
);
select is(
  (select count(*)::int from mic_series
    where id in (select id from was_active) and is_active),
  0,
  'and every listing that was live is paused'
);
select ok(
  not ((select paused_series from user_sanctions where id = (select id from s2))
       @> array(select id from pre_paused)),
  'the listing they had already paused is not recorded as the ban having paused it'
);
select is(
  (select count(*)::int from public_profiles
    where id = '00000000-0000-4000-a000-000000000002'),
  0,
  'a banned account stops resolving through public_profiles'
);
select is(
  (select count(*)::int from public_profiles
    where id = '00000000-0000-4000-a000-000000000003'),
  1,
  'while a suspended one still does, because their mics are still running'
);

-- The banned producer can do none of the things a producer does.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$insert into venues (name, address_line, city, region, location, created_by)
    values ('Banned Room', 'x', 'Seattle', 'WA', 'POINT(-122.3 47.6)',
            '00000000-0000-4000-a000-000000000002')$$,
  '42501', null,
  'a banned account cannot create a venue'
);

-- An update fails by filtering rather than raising, so this is a row count.
update mic_series set title = 'Renamed while banned'
where owner_id = '00000000-0000-4000-a000-000000000002';
select is(
  (select count(*)::int from mic_series where title = 'Renamed while banned'),
  0,
  'and cannot edit its own listings'
);

select throws_ok(
  $$insert into reports (reporter_id, target_type, target_id, reason, details)
    values ('00000000-0000-4000-a000-000000000002', 'profile',
            '00000000-0000-4000-a000-000000000001', 'spam', 'banned user reporting')$$,
  '42501', null,
  'and cannot file reports'
);
select throws_ok(
  $$insert into listing_flags (series_id, flagger_id, reason, details)
    values ('20000000-0000-4000-c000-000000000004',
            '00000000-0000-4000-a000-000000000002', 'not_happening', 'banned flag')$$,
  '42501', null,
  'or flags'
);
reset role;

-- A moderator is unaffected by the subject's state: the admin branch of each
-- policy stands on its own.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
update mic_series set title = 'Moderator renamed this'
where id = (select id from was_active order by id limit 1);
reset role;
select cmp_ok(
  (select count(*)::int from mic_series where title = 'Moderator renamed this'),
  '>', 0,
  'a moderator can still edit a banned account listing'
);

-- ---------------------------------------------------------------------------
-- Auditing and reversal.
-- ---------------------------------------------------------------------------
select is(
  (select action from admin.audit_log where target_id = (select id from s2)),
  'user.ban',
  'the ban is audited under its own action'
);
select ok(
  (select after_state -> 'paused_series' is not null
     from admin.audit_log where target_id = (select id from s2)),
  'with the listings it paused recorded on the entry'
);
select ok(
  (select audit_id is not null from user_sanctions where id = (select id from s2)),
  'and the sanction remembers which entry recorded it'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
select lives_ok(
  format($$select admin_sanction_lift(%L,
      'Appeal upheld. The reports came from one person using three handles.',
      '203.0.113.7'::inet)$$, (select id from s2)),
  'an owner can lift a ban a moderator applied'
);
select throws_ok(
  format($$select admin_sanction_lift(%L, 'again', '203.0.113.7'::inet)$$,
    (select id from s2)),
  '23505', null,
  'and cannot lift it twice'
);
reset role;

select ok(
  not private.is_banned('00000000-0000-4000-a000-000000000002'),
  'the ban is no longer in force'
);
select is(
  (select count(*)::int from mic_series
    where id in (select id from was_active) and is_active),
  (select count(*)::int from was_active),
  'every listing the ban paused is switched back on'
);
select is(
  (select count(*)::int from mic_series
    where id in (select id from pre_paused) and is_active),
  0,
  'and the one they had paused themselves stays off, which is why the ids were recorded'
);
select is(
  (select a.action from admin.audit_log a
    where a.reverses_id =
      (select audit_id from user_sanctions where id = (select id from s2))),
  'user.sanction_lift',
  'the lift is recorded as a reversal pointing at the ban'
);
select is(
  (select a.actor_id from admin.audit_log a
    where a.reverses_id =
      (select audit_id from user_sanctions where id = (select id from s2))),
  '00000000-0000-4000-a000-000000000005'::uuid,
  'so who lifted it is answerable from the log without a second table'
);

-- ---------------------------------------------------------------------------
-- One live restriction at a time.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000003',
      'banned', 'all_writes', null, 'stacking on the live suspension',
      '203.0.113.7'::inet)$$,
  '23505', 'that account already has a live suspension or ban. Lift it first.',
  'a second live restriction is refused while the first stands'
);
select lives_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000003',
      'warned', 'all_writes', null, 'Warnings stack: they restrict nothing.',
      '203.0.113.7'::inet)$$,
  'but warnings stack freely'
);
reset role;

-- ---------------------------------------------------------------------------
-- The sanctioned person can read their own record. That is what makes an
-- appeal possible, and it is why the reason column is written for them.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select cmp_ok(
  (select count(*)::int from user_sanctions), '>', 0,
  'the sanctioned person can read their own record'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::int from user_sanctions
    where user_id = '00000000-0000-4000-a000-000000000003'),
  0,
  'and nobody else can read it'
);

-- ---------------------------------------------------------------------------
-- Deleting the account still works. Both app stores require it, and somebody
-- who has just been banned is exactly who wants out.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select delete_account()$$,
  'and a sanctioned account can still delete itself'
);
reset role;

select * from finish();
rollback;
