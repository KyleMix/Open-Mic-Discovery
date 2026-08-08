-- AAL2 and step-up: off by default, and real once switched on.
--
-- Claims are synthesised here rather than obtained from Supabase Auth, which is
-- the only way to test this without a live Pro project and an enrolled factor.
-- What that does and does not prove is written down in
-- docs/admin/SECURITY-VERIFICATION.md: the predicate logic is genuinely
-- exercised, and the one thing left resting on documentation is the exact
-- `method` string Supabase writes into amr, which admin.mfa_methods() holds in a
-- single place for that reason.
--
-- On roles in this file: request.jwt.claims is a session setting, so it survives
-- a role change and can be set once either side of one. Direct calls to the
-- admin.* helpers run with the role reset, because `authenticated` has no USAGE
-- on the admin schema and is not supposed to: in production every caller of
-- those helpers is a SECURITY DEFINER function, which is the path the policy and
-- RPC assertions below exercise.
--
-- Seed: 0004 moderator, 0005 owner, 0001 plain performer, 0002 producer.
begin;
select plan(29);

-- A helper so the intent of each claim set is legible rather than buried in json.
create function pg_temp.sign_in(p_uid text, p_aal text, p_mfa_age interval default null)
returns void
language plpgsql
as $$
declare
  v_amr jsonb := jsonb_build_array(
    jsonb_build_object('method', 'password',
                       'timestamp', extract(epoch from now() - interval '1 hour')::bigint));
begin
  if p_mfa_age is not null then
    v_amr := v_amr || jsonb_build_object(
      'method', 'totp',
      'timestamp', extract(epoch from now() - p_mfa_age)::bigint);
  end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated',
                       'aal', p_aal, 'amr', v_amr)::text,
    true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The switch ships off, and with it off nothing changes.
-- ---------------------------------------------------------------------------
select is(
  (select require_aal2 from admin.security_settings),
  false,
  'the AAL2 requirement ships switched off, so applying the migration locks nobody out'
);
select ok(
  not (select admin.aal2_required()),
  'and the predicate agrees'
);

set local role authenticated;
select pg_temp.sign_in('00000000-0000-4000-a000-000000000004', 'aal1');
select ok(
  (select private.is_admin()) and (select private.is_admin_reader()),
  'an AAL1 moderator is still a moderator while the flag is off'
);
select cmp_ok(
  (select count(*)::int from admin_profile_review), '>', 0,
  'so the review views still answer'
);
reset role;
select lives_ok(
  $$select admin.require_step_up()$$,
  'and step-up passes trivially, which is what keeps today working'
);

-- ---------------------------------------------------------------------------
-- Reading the session. These hold regardless of the flag.
-- ---------------------------------------------------------------------------
select is((select admin.session_aal()), 'aal1', 'the aal claim is read from the session');
select pg_temp.sign_in('00000000-0000-4000-a000-000000000004', 'aal2', interval '1 minute');
select is((select admin.session_aal()), 'aal2', 'and so is aal2');
select ok(
  (select admin.mfa_verified_at()) > now() - interval '2 minutes',
  'the amr claim yields the time of the TOTP challenge'
);
select pg_temp.sign_in('00000000-0000-4000-a000-000000000004', 'aal2');
select is(
  (select admin.mfa_verified_at()), null,
  'and an amr with no TOTP entry yields no challenge time at all'
);

-- ---------------------------------------------------------------------------
-- Switch it on. Everything below is the state S3 and S8 describe.
-- ---------------------------------------------------------------------------
update admin.security_settings set require_aal2 = true, updated_at = now();
select ok((select admin.aal2_required()), 'the requirement is on');

set local role authenticated;

-- S3: an AAL1 session reads nothing and writes nothing.
select pg_temp.sign_in('00000000-0000-4000-a000-000000000004', 'aal1', interval '1 minute');
select ok(
  not (select private.is_admin()) and not (select private.is_admin_reader()),
  'an AAL1 moderator satisfies neither predicate, whatever their amr says'
);
select is(
  (select count(*)::int from admin_profile_review), 0,
  'so the review view shows them nothing'
);
select is(
  (select count(*)::int from reports), 0,
  'and the report queue shows them nothing'
);
select throws_ok(
  $$select moderate_content('venue', '10000000-0000-4000-b000-000000000004', true)$$,
  '42501', 'only admins can moderate content',
  'and moderate_content refuses them, because it asks the same predicate'
);
select throws_ok(
  $$select admin_reveal('00000000-0000-4000-a000-000000000002', 'contact_phone',
      'AAL1 attempt', '203.0.113.7'::inet)$$,
  '42501', 'only a moderator or an owner can reveal contact details',
  'and so does a reveal'
);

-- An AAL2 session with a stale challenge: reads work, destructive actions do not.
select pg_temp.sign_in('00000000-0000-4000-a000-000000000004', 'aal2', interval '30 minutes');
select ok(
  (select private.is_admin()) and (select private.is_admin_reader()),
  'an AAL2 session satisfies both predicates again'
);
select cmp_ok(
  (select count(*)::int from admin_profile_review), '>', 0,
  'and reads the queue'
);
select lives_ok(
  $$select moderate_content('venue', '10000000-0000-4000-b000-000000000004', true)$$,
  'and can moderate held content, which needs no fresh challenge'
);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000002',
      'banned', 'all_writes', null, 'stale challenge', '203.0.113.7'::inet)$$,
  '42501', null,
  'but cannot ban anybody on a half hour old challenge'
);
select lives_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000002',
      'warned', 'all_writes', null,
      'A warning is not destructive, so it needs no fresh challenge.',
      '203.0.113.7'::inet)$$,
  'while a warning still lands, because making the cheapest action the hardest is backwards'
);

-- A fresh challenge unlocks the destructive path.
select pg_temp.sign_in('00000000-0000-4000-a000-000000000004', 'aal2', interval '30 seconds');
select lives_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000002',
      'banned', 'all_writes', null,
      'Fresh challenge, so the ban goes through.', '203.0.113.7'::inet)$$,
  'a challenge from thirty seconds ago is fresh enough to ban'
);

-- Admin management is destructive too: changing who can reach the console.
select pg_temp.sign_in('00000000-0000-4000-a000-000000000005', 'aal2', interval '30 minutes');
select throws_ok(
  $$select admin_invite('someone@example.com', 'moderator', 'stale challenge',
      '203.0.113.7'::inet)$$,
  '42501', null,
  'an owner cannot invite an admin on a stale challenge'
);
select pg_temp.sign_in('00000000-0000-4000-a000-000000000005', 'aal2', interval '10 seconds');
select lives_ok(
  $$select admin_invite('someone@example.com', 'moderator',
      'Fresh challenge, so the invitation is issued.', '203.0.113.7'::inet)$$,
  'and can with a fresh one'
);

-- The boundary itself, from both sides. Direct helper calls, so role reset.
reset role;
select pg_temp.sign_in('00000000-0000-4000-a000-000000000005', 'aal2',
                       admin.step_up_window() - interval '10 seconds');
select lives_ok(
  $$select admin.require_step_up()$$,
  'just inside the five minute window passes'
);
select pg_temp.sign_in('00000000-0000-4000-a000-000000000005', 'aal2',
                       admin.step_up_window() + interval '10 seconds');
select throws_ok(
  $$select admin.require_step_up()$$,
  '42501', null,
  'and just outside it does not'
);

-- An AAL2 claim with no TOTP in amr is not a completed challenge.
select pg_temp.sign_in('00000000-0000-4000-a000-000000000005', 'aal2');
select throws_ok(
  $$select admin.require_step_up()$$,
  '42501', null,
  'an aal2 claim with nothing in amr to back it up is refused'
);

-- An ordinary user is unaffected by any of this: they were never an admin, and
-- the flag must not change what the app does.
set local role authenticated;
select pg_temp.sign_in('00000000-0000-4000-a000-000000000001', 'aal1');
select ok(
  not (select private.is_admin()),
  'a plain user is still not an admin, which is the same answer as before'
);
select cmp_ok(
  (select count(*)::int from mic_series), '>', 0,
  'and still reads the app: discovery does not consult these predicates'
);
reset role;

-- Turning it back off is the way out of a bad enrolment.
update admin.security_settings set require_aal2 = false, updated_at = now();
set local role authenticated;
select pg_temp.sign_in('00000000-0000-4000-a000-000000000004', 'aal1');
select ok(
  (select private.is_admin()),
  'flipping the flag back restores access immediately, which is the lockout escape'
);
reset role;

select * from finish();
rollback;
