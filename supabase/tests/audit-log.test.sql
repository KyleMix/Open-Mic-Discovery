-- The audit log is append only, unreachable from the API, and its actor cannot
-- be forged.
--
-- On how the appends below are made. An authenticated session cannot call
-- admin.append_audit() directly, because calling a function needs USAGE on its
-- schema and no API role has it, SECURITY DEFINER or not. That is the design
-- and assertion 7 pins it. The real caller is a SECURITY DEFINER function in
-- public, owned by the migration role, which authorizes and then appends: the
-- shape every console mutation will have. This file creates one such wrapper so
-- the call path under test is the call path that will ship. It is created inside
-- the test transaction and goes away with the rollback.
--
-- Seed accounts: 0004 is an admin whose email is not the owner email, 0005 is
-- the owner, 0001 is a plain performer.
begin;
select plan(28);

-- ---------------------------------------------------------------------------
-- Reachability. The schema is the first gate, and it is the one that makes
-- every grant inside it moot.
-- ---------------------------------------------------------------------------
select ok(
  not has_schema_privilege('anon', 'admin', 'USAGE')
  and not has_schema_privilege('authenticated', 'admin', 'USAGE'),
  'no API role has usage on the admin schema'
);
select ok(
  has_schema_privilege('service_role', 'admin', 'USAGE'),
  'the service role does, so the console can read the log'
);

-- S6 is a statement about which grants exist, so assert the grants and not only
-- the behaviour they produce.
select ok(
  has_table_privilege('service_role', 'admin.audit_log', 'SELECT'),
  'the service role may read the log'
);
select ok(
  not has_table_privilege('service_role', 'admin.audit_log', 'INSERT')
  and not has_table_privilege('service_role', 'admin.audit_log', 'UPDATE')
  and not has_table_privilege('service_role', 'admin.audit_log', 'DELETE')
  and not has_table_privilege('service_role', 'admin.audit_log', 'TRUNCATE'),
  'and may not write, update, delete or truncate it'
);
select ok(
  not has_table_privilege('anon', 'admin.audit_log', 'SELECT')
  and not has_table_privilege('authenticated', 'admin.audit_log', 'SELECT')
  and not has_table_privilege('authenticated', 'admin.audit_log', 'UPDATE')
  and not has_table_privilege('authenticated', 'admin.audit_log', 'DELETE'),
  'and no API role holds any privilege on it at all'
);
select ok(
  (select relrowsecurity from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'admin' and c.relname = 'audit_log'),
  'row level security is enabled, so the project rule has no exception'
);

-- ---------------------------------------------------------------------------
-- The call path: through a definer function in public, never directly.
-- ---------------------------------------------------------------------------
create function public.test_only_append(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text,
  p_request_ip inet,
  p_reverses_id bigint default null,
  p_reversible boolean default true
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select admin.append_audit(p_action, p_target_type, p_target_id, p_before,
                            p_after, p_reason, p_request_ip, p_reverses_id,
                            p_reversible);
$$;
grant execute on function public.test_only_append(
  text, text, uuid, jsonb, jsonb, text, inet, bigint, boolean) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);

select throws_ok(
  $$select admin.append_audit('listing.hide', 'mic_series', null, null, null,
      'reaching past the wrapper', '203.0.113.7'::inet)$$,
  '42501', null,
  'an authenticated session cannot call admin.append_audit directly'
);

select lives_ok(
  $$select public.test_only_append(
      'listing.hide', 'mic_series', '20000000-0000-4000-c000-000000000004',
      '{"moderation_status":"approved"}'::jsonb,
      '{"moderation_status":"rejected"}'::jsonb,
      'Venue confirmed the night has not run since May.',
      '203.0.113.7'::inet)$$,
  'and can append through a definer function in public, which is what a console mutation is'
);
reset role;

select is(
  (select actor_id from admin.audit_log order by id desc limit 1),
  '00000000-0000-4000-a000-000000000004'::uuid,
  'the actor is the session, taken from auth.uid() and not from an argument'
);
select is(
  (select actor_role from admin.audit_log order by id desc limit 1),
  'moderator'::admin.admin_role,
  'an admin who is not the owner is recorded as a moderator'
);
select is(
  (select before_state -> 'moderation_status' from admin.audit_log order by id desc limit 1),
  '"approved"'::jsonb,
  'the before state is kept'
);
select is(
  (select request_ip from admin.audit_log order by id desc limit 1),
  '203.0.113.7'::inet,
  'and the request IP the console passed in'
);

-- The role is derived from the session, so the owner is recorded as the owner.
-- admin.actor_role() reads the claim rather than the database role, so this runs
-- without switching roles.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
select is(
  (select admin.actor_role()),
  'owner'::admin.admin_role,
  'the owner email is recorded as owner, not moderator'
);

-- ---------------------------------------------------------------------------
-- Who cannot append.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.test_only_append('user.ban', 'profile',
      '00000000-0000-4000-a000-000000000002'::uuid, null, null,
      'because I feel like it', '203.0.113.9'::inet)$$,
  '42501', 'only an admin can be the actor on an audit entry',
  'a plain user cannot append an entry, even through the wrapper'
);
reset role;

-- No session means no actor. This is also why service-role-only automation
-- cannot write here, which is deliberate: an automated state change is not a
-- moderator action.
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$select admin.append_audit('listing.hide', 'mic_series', null, null, null,
      'from a cron job', null)$$,
  '42501', 'an audit entry needs a session: there is no actor here',
  'a caller with no session cannot append an entry'
);

-- ---------------------------------------------------------------------------
-- Required fields. A reason that says nothing is not a reason.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select admin.append_audit('user.warn', 'profile',
      '00000000-0000-4000-a000-000000000002'::uuid, null, null,
      '   ', '203.0.113.7'::inet)$$,
  '23514', null,
  'a blank reason is refused'
);
select throws_ok(
  $$select admin.append_audit('NotAnAction', 'profile',
      '00000000-0000-4000-a000-000000000002'::uuid, null, null,
      'a good reason', '203.0.113.7'::inet)$$,
  '23514', null,
  'an action outside the domain.verb shape is refused'
);
select throws_ok(
  $$select admin.append_audit('listing.hide', '', null, null, null,
      'a good reason', '203.0.113.7'::inet)$$,
  '23514', null,
  'and so is an empty target type'
);

-- ---------------------------------------------------------------------------
-- Reversal: the whole reason this is one table and not two.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from admin.audit_log
    where reverses_id = (select min(id) from admin.audit_log)),
  0,
  'the first entry has not been reversed'
);

select lives_ok(
  $$select admin.append_audit(
      'listing.restore', 'mic_series', '20000000-0000-4000-c000-000000000004',
      '{"moderation_status":"rejected"}'::jsonb,
      '{"moderation_status":"approved"}'::jsonb,
      'Producer sent a photo of this week night. My call was wrong.',
      '203.0.113.7'::inet,
      (select min(id) from admin.audit_log))$$,
  'an entry can be reversed by a later entry that points at it'
);
select is(
  (select a.action from admin.audit_log a
    where a.reverses_id = (select min(id) from admin.audit_log)),
  'listing.restore',
  'and the reversal names the entry it undid, so reversed_by is its own actor'
);
select is(
  (select a.actor_id from admin.audit_log a
    where a.reverses_id = (select min(id) from admin.audit_log)),
  '00000000-0000-4000-a000-000000000004'::uuid,
  'which is what replaces a reversed_by column: the reversal carries its own actor'
);

-- One action, one reversal. A second is a conflict, not a second history.
select throws_ok(
  $$select admin.append_audit(
      'listing.restore', 'mic_series', '20000000-0000-4000-c000-000000000004',
      null, null, 'trying to undo it twice', '203.0.113.7'::inet,
      (select min(id) from admin.audit_log))$$,
  '23505', null,
  'the same entry cannot be reversed twice'
);

-- An action recorded as not reversible refuses a reversal.
select admin.append_audit(
  'account.purge', 'profile', '00000000-0000-4000-a000-000000000002'::uuid,
  null, null, 'Legal request, handled outside the console.',
  '203.0.113.7'::inet, null, false);
select throws_ok(
  format($$select admin.append_audit('account.restore', 'profile', null, null, null,
      'putting it back', '203.0.113.7'::inet, %s)$$,
    (select max(id) from admin.audit_log)),
  '23514', null,
  'an entry marked not reversible cannot be reversed'
);

-- A reverses_id that names nothing is refused. The function's own existence
-- check reaches it before the foreign key does, which is why the code here is
-- 23514 and not 23503: the message names the entry, which a bare foreign key
-- violation would not. The constraint stays as the backstop.
select throws_ok(
  $$select admin.append_audit('listing.restore', 'mic_series', null, null, null,
      'pointing at nothing', '203.0.113.7'::inet, 987654321)$$,
  '23514', 'audit entry 987654321 does not exist or is marked not reversible',
  'a reversal pointing at an entry that does not exist is refused'
);

-- ---------------------------------------------------------------------------
-- Append only, proven against the strongest caller in the database.
--
-- These run with no role switch, which in this harness means the superuser that
-- owns the table. The grants above cannot stop that caller. The trigger can, and
-- that is why S6 asks for both.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update admin.audit_log set reason = 'rewritten'
      where id = (select min(id) from admin.audit_log)$$,
  '42501', null,
  'the table owner cannot update an entry'
);
select throws_ok(
  $$delete from admin.audit_log where id = (select min(id) from admin.audit_log)$$,
  '42501', null,
  'the table owner cannot delete an entry'
);
select throws_ok(
  $$truncate admin.audit_log$$,
  '42501', null,
  'and cannot truncate the table'
);

select * from finish();
rollback;
