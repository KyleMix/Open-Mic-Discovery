-- The admin allowlist: invite only, owner managed, audited, and the one place
-- that decides whether profiles.is_admin is true.
--
-- Seed fixture: 0005 is the owner, 0004 a moderator, 0001 a plain performer,
-- 0002 a producer with no console access.
begin;
select plan(44);

-- ---------------------------------------------------------------------------
-- Reachability. Same posture as audit_log: the schema is the gate.
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'admin.admin_users', 'SELECT')
  and not has_table_privilege('authenticated', 'admin.admin_users', 'INSERT')
  and not has_table_privilege('authenticated', 'admin.admin_users', 'UPDATE')
  and not has_table_privilege('authenticated', 'admin.admin_users', 'DELETE'),
  'authenticated holds no privilege on the allowlist'
);
select ok(
  has_table_privilege('service_role', 'admin.admin_users', 'SELECT')
  and not has_table_privilege('service_role', 'admin.admin_users', 'INSERT')
  and not has_table_privilege('service_role', 'admin.admin_users', 'UPDATE')
  and not has_table_privilege('service_role', 'admin.admin_users', 'DELETE'),
  'the service role may read it and not write it, so the RPCs are the only writer'
);
select ok(
  has_table_privilege('service_role', 'admin.admin_invites', 'SELECT')
  and not has_table_privilege('service_role', 'admin.admin_invites', 'UPDATE')
  and not has_table_privilege('anon', 'admin.admin_invites', 'SELECT'),
  'and the same for invitations'
);

-- The default privileges in 20260728001200 grant EXECUTE on every new public
-- function to anon, so each RPC has to revoke it back.
select ok(
  not has_function_privilege('anon', 'admin_invite(text, text, text, inet, interval)', 'EXECUTE')
  and not has_function_privilege('anon', 'admin_set_role(uuid, text, text, inet)', 'EXECUTE')
  and not has_function_privilege('anon', 'admin_set_active(uuid, boolean, text, inet)', 'EXECUTE')
  and not has_function_privilege('anon', 'admin_invite_accept(text)', 'EXECUTE'),
  'anon cannot execute any of the admin management functions'
);
select ok(
  has_function_privilege('authenticated', 'admin_invite(text, text, text, inet, interval)', 'EXECUTE')
  and has_function_privilege('authenticated', 'admin_invite_accept(text)', 'EXECUTE'),
  'authenticated can, because the console calls them with a user JWT'
);

-- ---------------------------------------------------------------------------
-- profiles.is_admin is a cache of the allowlist, and the fixture agrees with it.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.profiles p
    where p.is_admin is distinct from private.admin_bit_for(p.id)),
  0,
  'every profile agrees with the allowlist about whether it is an admin'
);
select ok(
  private.admin_bit_for('00000000-0000-4000-a000-000000000005')
  and private.admin_bit_for('00000000-0000-4000-a000-000000000004')
  and not private.admin_bit_for('00000000-0000-4000-a000-000000000001'),
  'the owner and the moderator carry the bit, a plain performer does not'
);

-- ---------------------------------------------------------------------------
-- Only an owner manages admins.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select admin_invite('new@example.com', 'moderator', 'building the team',
      '203.0.113.7'::inet)$$,
  '42501', 'only an owner can manage admins',
  'a moderator cannot invite an admin'
);
select throws_ok(
  $$select admin_set_role('00000000-0000-4000-a000-000000000005', 'read_only',
      'taking over', '203.0.113.7'::inet)$$,
  '42501', 'only an owner can manage admins',
  'and cannot demote the owner, which is the escalation this table exists to stop'
);
select throws_ok(
  $$select admin_set_role('00000000-0000-4000-a000-000000000004', 'owner',
      'promoting myself', '203.0.113.7'::inet)$$,
  '42501', 'only an owner can manage admins',
  'and cannot promote themselves to owner'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select admin_invite('new@example.com', 'owner', 'hello', '203.0.113.7'::inet)$$,
  '42501', 'only an owner can manage admins',
  'a plain user cannot invite anyone'
);

-- ---------------------------------------------------------------------------
-- The owner can, and every action lands in the audit log.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);

select lives_ok(
  $$select admin_invite('newmod@example.com', 'moderator',
      'Cover for the Thursday queue while I am away.', '203.0.113.7'::inet)$$,
  'the owner can invite a moderator'
);
reset role;

select is(
  (select count(*)::int from admin.admin_invites
    where email = 'newmod@example.com' and consumed_at is null and revoked_at is null),
  1,
  'the invitation is live'
);
select ok(
  (select token_hash ~ '^[0-9a-f]{64}$' from admin.admin_invites
    where email = 'newmod@example.com'),
  'and only a hash of the token is stored'
);
select is(
  (select action from admin.audit_log order by id desc limit 1),
  'admin.invite',
  'the invitation is audited'
);
select is(
  (select actor_role from admin.audit_log order by id desc limit 1),
  'owner'::admin.admin_role,
  'with the actor role read from the allowlist'
);
select ok(
  (select after_state ->> 'role' = 'moderator'
     and after_state ? 'expires_at'
     and not (after_state::text like '%' || (
       select token_hash from admin.admin_invites where email = 'newmod@example.com') || '%')
   from admin.audit_log order by id desc limit 1),
  'and the audit row records the role without recording the token or its hash'
);

-- A second live invitation for the same address is a mistake, not two tokens.
set local role authenticated;
select throws_ok(
  $$select admin_invite('newmod@example.com', 'read_only', 'again',
      '203.0.113.7'::inet)$$,
  '23505', 'that address already has a live invitation. Revoke it first.',
  'one live invitation per address'
);

-- An address that is already an active admin cannot be invited.
select throws_ok(
  $$select admin_invite('admin@demo.openmicexplorer.local', 'moderator',
      'again', '203.0.113.7'::inet)$$,
  '23505', 'that address is already an active admin',
  'and an existing active admin cannot be re-invited'
);

select throws_ok(
  $$select admin_invite('not-an-email', 'moderator', 'oops', '203.0.113.7'::inet)$$,
  '22P02', 'that does not look like an email address',
  'a malformed address is refused'
);
select throws_ok(
  $$select admin_invite('someone@example.com', 'superuser', 'oops',
      '203.0.113.7'::inet)$$,
  '22P02', 'role must be owner, moderator or read_only, not superuser',
  'and so is a role outside the three'
);
reset role;

-- ---------------------------------------------------------------------------
-- Accepting. The token proves the invitation, the session proves the address.
-- 0002 is a producer with no console access; the invitation below is for them.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
create temp table issued as
  select admin_invite('producer@demo.openmicexplorer.local', 'read_only',
    'Read only access so they can see their own reports land.',
    '203.0.113.7'::inet) as token;

-- The wrong person holding the right token gets nothing.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok(
  (select format($$select admin_invite_accept(%L)$$, token) from issued),
  '42501', 'that invitation was issued to a different address',
  'a token redeemed from the wrong account is refused'
);

-- A token that is not an invitation at all.
select throws_ok(
  $$select admin_invite_accept('deadbeef')$$,
  'P0002', 'that invitation is not valid',
  'and so is a token that matches nothing'
);

-- The invited person accepts.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is(
  (select admin_invite_accept(token) from issued),
  'read_only',
  'the invited person accepts and lands at the invited role'
);
select throws_ok(
  (select format($$select admin_invite_accept(%L)$$, token) from issued),
  'P0002', 'that invitation is not valid',
  'and the token is single use'
);
reset role;

select is(
  (select role from admin.admin_users where user_id = '00000000-0000-4000-a000-000000000002'),
  'read_only'::admin.admin_role,
  'the allowlist row exists at read_only'
);
select is(
  (select is_admin from public.profiles where id = '00000000-0000-4000-a000-000000000002'),
  false,
  'and read_only leaves profiles.is_admin false, so the existing policies grant nothing'
);
select is(
  (select action from admin.audit_log order by id desc limit 1),
  'admin.invite_accept',
  'the acceptance is audited'
);
select is(
  (select actor_role from admin.audit_log order by id desc limit 1),
  'read_only'::admin.admin_role,
  'with the new admin as the actor, at the role they just took up'
);

-- ---------------------------------------------------------------------------
-- The cache follows the allowlist in both directions.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
select lives_ok(
  $$select admin_set_role('00000000-0000-4000-a000-000000000002', 'moderator',
      'They have been handling the Thursday queue well.', '203.0.113.7'::inet)$$,
  'the owner can promote read_only to moderator'
);
reset role;
select is(
  (select is_admin from public.profiles where id = '00000000-0000-4000-a000-000000000002'),
  true,
  'and profiles.is_admin follows, so the existing admin policies start applying'
);

set local role authenticated;
select lives_ok(
  $$select admin_set_active('00000000-0000-4000-a000-000000000002', false,
      'Stepped back from moderating. Keeping the row so it can be switched on.',
      '203.0.113.7'::inet)$$,
  'the owner can switch an admin off'
);
reset role;
select is(
  (select is_admin from public.profiles where id = '00000000-0000-4000-a000-000000000002'),
  false,
  'and the cache follows that too, immediately'
);
select is(
  (select count(*)::int from admin.admin_users
    where user_id = '00000000-0000-4000-a000-000000000002'),
  1,
  'the row is kept rather than deleted, so the history and the reversal survive'
);
select is(
  (select action from admin.audit_log order by id desc limit 1),
  'admin.deactivate',
  'and deactivation is audited under its own action'
);

-- ---------------------------------------------------------------------------
-- Nobody can aim admin management at their own row.
-- ---------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$select admin_set_role('00000000-0000-4000-a000-000000000005', 'moderator',
      'stepping down', '203.0.113.7'::inet)$$,
  '42501', 'you cannot change your own role',
  'an owner cannot change their own role'
);
select throws_ok(
  $$select admin_set_active('00000000-0000-4000-a000-000000000005', false,
      'locking myself out', '203.0.113.7'::inet)$$,
  '42501', 'you cannot deactivate yourself',
  'and cannot deactivate themselves, which is what keeps one active owner'
);
select throws_ok(
  $$select admin_set_role('00000000-0000-4000-a000-000000000001', 'moderator',
      'they are not on the list', '203.0.113.7'::inet)$$,
  'P0002', 'that person is not on the admin allowlist',
  'and cannot set a role on somebody who was never invited'
);
select throws_ok(
  $$select admin_set_role('00000000-0000-4000-a000-000000000004', 'moderator',
      'no change', '203.0.113.7'::inet)$$,
  '23514', 'they already hold that role',
  'a no-op role change is an error rather than an audit row that says nothing'
);
reset role;

-- ---------------------------------------------------------------------------
-- Revoking an invitation before it is used.
--
-- The id is resolved here, with the role reset, rather than in a subquery inside
-- the calls below: a subquery in the statement runs as the caller, and
-- `authenticated` has no usage on the admin schema. Only the function body
-- crosses that boundary, which is the whole point of the arrangement.
-- ---------------------------------------------------------------------------
create temp table to_revoke as
  select id from admin.admin_invites where email = 'newmod@example.com';
-- Created by the reset role, so it needs handing to the role that reads it.
grant select on to_revoke to authenticated;

set local role authenticated;
select lives_ok(
  $$select admin_invite_revoke((select id from to_revoke),
      'Hired someone else for the slot.', '203.0.113.7'::inet)$$,
  'the owner can revoke a live invitation'
);
select throws_ok(
  $$select admin_invite_revoke((select id from to_revoke),
      'again', '203.0.113.7'::inet)$$,
  'P0002', 'no live invitation with that id',
  'and cannot revoke it twice'
);
reset role;
select is(
  (select action from admin.audit_log order by id desc limit 1),
  'admin.invite_revoke',
  'revocation is audited'
);

-- ---------------------------------------------------------------------------
-- F-B is still closed, now through the allowlist rather than a pinned column.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
update public.profiles set is_admin = true
where id = '00000000-0000-4000-a000-000000000001';
reset role;
select is(
  (select is_admin from public.profiles where id = '00000000-0000-4000-a000-000000000001'),
  false,
  'a moderator writing is_admin directly is overwritten from the allowlist'
);

set local role authenticated;
update public.profiles set is_admin = false
where id = '00000000-0000-4000-a000-000000000005';
reset role;
select is(
  (select is_admin from public.profiles where id = '00000000-0000-4000-a000-000000000005'),
  true,
  'and cannot strip the bit from an owner the allowlist still lists'
);

select * from finish();
rollback;
