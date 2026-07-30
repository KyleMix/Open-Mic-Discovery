-- Web deletion path and rate limit helper tests.
--
-- Proves the Google Play web deletion requirement: an identity-confirmed
-- request handled by the service role (delete_account_web) ends in exactly
-- the same state as the in-app path (delete_account), and invalid or
-- already-deleted accounts fail safely.
begin;
select plan(19);

-- ---------------------------------------------------------------------------
-- In-app path: performer 0001 deletes their own account.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select lives_ok($$select delete_account()$$, 'in-app: a user can delete their own account');

reset role;
select is(
  (select count(*)::int from auth.users where id = '00000000-0000-4000-a000-000000000001'),
  0, 'in-app: the auth user is hard-deleted'
);
select is(
  (select display_name from profiles where id = '00000000-0000-4000-a000-000000000001'),
  'Deleted user', 'in-app: the profile is anonymized'
);

-- ---------------------------------------------------------------------------
-- Web path: the dual-role account 0003 is deleted with the service role, as
-- the deletion-request Edge Function does after confirming identity.
-- ---------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select delete_account_web('00000000-0000-4000-a000-000000000003')$$,
  'web: the service role can delete a confirmed account'
);

reset role;
select is(
  (select count(*)::int from auth.users where id = '00000000-0000-4000-a000-000000000003'),
  0, 'web: the auth user is hard-deleted, same as in-app'
);
select is(
  (select display_name from profiles where id = '00000000-0000-4000-a000-000000000003'),
  'Deleted user', 'web: the profile is anonymized, same as in-app'
);

-- Both anonymized rows are byte-identical apart from their id-derived handle:
-- every personal column is cleared the same way on both paths.
select is(
  (select count(*)::int from profiles
   where id in ('00000000-0000-4000-a000-000000000001',
                '00000000-0000-4000-a000-000000000003')
     and display_name = 'Deleted user'
     and avatar_url is null and bio is null
     and home_city is null and home_region is null and home_postal_code is null
     and home_lat is null and home_lng is null and home_location is null
     and birth_year is null
     and link_instagram is null and link_tiktok is null
     and link_youtube is null and link_website is null
     and deleted_at is not null),
  2, 'both paths clear every personal column identically'
);
select is(
  (select count(*)::int from performer_profiles
   where profile_id in ('00000000-0000-4000-a000-000000000001',
                        '00000000-0000-4000-a000-000000000003')),
  0, 'both paths remove performer profiles'
);
select is(
  (select count(*)::int from signups
   where performer_id = '00000000-0000-4000-a000-000000000001'),
  1, 'signup history rows survive, referencing the anonymized profile'
);

-- ---------------------------------------------------------------------------
-- An account that never finished onboarding (auth user, no profile row)
-- can still be deleted from the web: the sign-in is removed.
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email)
values ('00000000-0000-4000-a000-0000000000aa', 'never-onboarded@demo.openmicexplorer.local');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select delete_account_web('00000000-0000-4000-a000-0000000000aa')$$,
  'web: an account with no profile can still be deleted'
);
reset role;
select is(
  (select count(*)::int from auth.users
   where id = '00000000-0000-4000-a000-0000000000aa'),
  0, 'web: the never-onboarded auth user is gone'
);

-- ---------------------------------------------------------------------------
-- Failure safety.
-- ---------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select delete_account_web('99999999-0000-4000-a000-000000000099')$$,
  'P0002', 'account not found or already deleted',
  'web: an unknown account fails safely'
);
select throws_ok(
  $$select delete_account_web('00000000-0000-4000-a000-000000000003')$$,
  'P0002', 'account not found or already deleted',
  'web: an already-deleted account fails safely'
);

-- End users can never reach the web deletion RPC or the rate limit gate.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select delete_account_web('00000000-0000-4000-a000-000000000002')$$,
  '42501', null,
  'web: authenticated users cannot call delete_account_web'
);
select throws_ok(
  $$select deletion_request_allowed('x', 'y')$$,
  '42501', null,
  'authenticated users cannot call deletion_request_allowed'
);

-- ---------------------------------------------------------------------------
-- Rate limit helper: blocks the Nth+1 call and resets after the window.
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select bool_and(private.rate_limit('t-key', 3, interval '1 hour',
                                      '2026-07-29 10:00:00+00'))
   from generate_series(1, 3)),
  true, 'rate limit: the first max_calls calls are allowed'
);
select is(
  private.rate_limit('t-key', 3, interval '1 hour', '2026-07-29 10:59:00+00'),
  false, 'rate limit: the Nth+1 call inside the window is blocked'
);
select is(
  private.rate_limit('t-key', 3, interval '1 hour', '2026-07-29 11:01:00+00'),
  true, 'rate limit: the counter resets after the window passes'
);
select is(
  private.rate_limit('other-key', 3, interval '1 hour', '2026-07-29 10:59:00+00'),
  true, 'rate limit: keys are independent'
);

select * from finish();
rollback;
