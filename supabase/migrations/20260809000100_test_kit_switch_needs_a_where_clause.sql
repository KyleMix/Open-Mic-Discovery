-- The test kit kill switch could not be flipped from the app.
--
-- Tapping "Switch the test kit on" answered 400 with
-- "UPDATE requires a WHERE clause (21000)", so the kit shipped off by
-- 20260807000400 could not be turned back on, and the screen that says the
-- switch is not a one-way door was wrong.
--
-- Cause: PostgREST connects as `authenticator`, and Supabase preloads
-- pg_safeupdate into that session. Its post-parse hook refuses any UPDATE or
-- DELETE whose jointree carries no qualification, with SQLSTATE 21000. The
-- hook runs on parse analysis, so it does not care that the statement sits
-- inside a security definer function or that the definer is a superuser:
--
--   update public.test_kit_settings set enabled = p_enabled, updated_at = now();
--
-- had no WHERE clause, because test_kit_settings holds exactly one row
-- (`id boolean primary key default true check (id)`) and a WHERE looked like
-- noise. Under pg_safeupdate an unqualified statement is refused before it is
-- ever planned, so the whole RPC failed.
--
-- Why every test passed anyway: pgTAP runs as the migration role, which has
-- no preloaded safeupdate, so the existing "an admin can switch the kit off"
-- assertion in supabase/tests/test-kit.test.sql exercised a code path the API
-- roles could not reach. supabase/tests/safeupdate.test.sql now loads the
-- library when the server has it and calls the RPCs through it, which is what
-- closes that gap for good; on a Postgres without it, the file says so rather
-- than passing quietly.
--
-- `where id` is exact rather than defensive: id is the boolean primary key
-- pinned true by its check constraint, so it names the single settings row.
--
-- test_kit_reset had the same shape and was already fixed in passing by
-- 20260801000200, which scoped its registry delete to the rows it had really
-- removed. This was the last unqualified write reachable from the API.
--
-- Down migration: supabase/migrations/down/20260809000100_test_kit_switch_needs_a_where_clause.down.sql

create or replace function test_kit_set_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'the test kit is admin only' using errcode = '42501';
  end if;
  update public.test_kit_settings
     set enabled = p_enabled, updated_at = now()
   where id;
  return jsonb_build_object('enabled', p_enabled);
end;
$$;
grant execute on function test_kit_set_enabled to authenticated;
