-- Writes that reach the API must survive pg_safeupdate.
--
-- PostgREST connects as `authenticator`, and Supabase preloads
-- pg_safeupdate into that session. Its post-parse hook refuses any UPDATE or
-- DELETE with no qualification, SQLSTATE 21000, before the statement is
-- planned. Being inside a security definer function does not exempt it, and
-- neither does the definer being a superuser.
--
-- Every other file in this suite runs as the migration role, which has no
-- preloaded library, so an unqualified write inside an RPC passes there and
-- fails for every real caller. That is exactly how test_kit_set_enabled
-- shipped broken: supabase/tests/test-kit.test.sql asserted an admin could
-- flip the switch, and the app got a 400 (fixed in 20260809000100).
--
-- This file closes that gap by loading the library itself and calling the
-- write RPCs through it. On a Postgres that does not have safeupdate.so
-- (a plain local install, so scripts/db/verify-local.sh), the assertions skip
-- with the reason said out loud rather than passing quietly. The Supabase
-- stack does ship it, so `supabase test db` in CI runs them for real.
--
-- Seeded id used here:
--   ...0005 owner (kylewmixon@gmail.com): performer + producer + admin
begin;
select plan(4);

-- LOAD is a utility statement, so it goes through EXECUTE. A server without
-- the library raises rather than returning anything, hence the catch.
create function pg_temp.load_safeupdate() returns boolean
language plpgsql as $$
begin
  execute 'load ''safeupdate''';
  return true;
exception when others then
  return false;
end;
$$;

-- Loaded here, while the session is still the migration role: LOAD wants a
-- superuser for anything outside $libdir/plugins, even when the library is
-- already in the backend, so this cannot wait until the role switch below.
-- The answer is parked in a setting because a temp table would not be
-- readable by the role the assertions run as.
select set_config('tests.safeupdate', pg_temp.load_safeupdate()::text, true);
select diag(case when current_setting('tests.safeupdate')::boolean
                 then 'pg_safeupdate is loaded: the RPC assertions run for real'
                 else 'pg_safeupdate is not installed here: the RPC assertions skip'
            end);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}',
  true
);

-- The two calls the test kit screen makes on the kill switch. Each is one
-- UPDATE against a single-row table, which is precisely the shape that
-- tempts an author to leave the WHERE clause off.
select case when current_setting('tests.safeupdate')::boolean
       then (select lives_ok(
              $$select public.test_kit_set_enabled(false)$$,
              'an admin can switch the test kit off through pg_safeupdate'))
       else (select skip('pg_safeupdate is not installed on this server', 1))
       end;
select case when current_setting('tests.safeupdate')::boolean
       then (select lives_ok(
              $$select public.test_kit_set_enabled(true)$$,
              'and back on, so the kill switch is not a one-way door'))
       else (select skip('pg_safeupdate is not installed on this server', 1))
       end;

-- A WHERE clause that matched no row would satisfy safeupdate and still be
-- a broken switch, so the value is checked rather than just the absence of
-- an error. It rides with the call above: with that one skipped, this would
-- only be reading a switch nobody touched.
select case when current_setting('tests.safeupdate')::boolean
       then (select is(
              (select enabled from test_kit_settings),
              true,
              'and the one settings row really changed, so the qualification is not merely present'))
       else (select skip('pg_safeupdate is not installed on this server', 1))
       end;

-- Reset is the other API-reachable write that ends in an unqualified shape
-- if nobody is watching: it clears the registry it has just acted on.
select case when current_setting('tests.safeupdate')::boolean
       then (select lives_ok(
              $$select public.test_kit_reset()$$,
              'and reset clears the registry with its delete qualified'))
       else (select skip('pg_safeupdate is not installed on this server', 1))
       end;

select * from finish();
rollback;
