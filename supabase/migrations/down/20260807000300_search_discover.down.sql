-- Down migration for 20260807000300_search_discover.sql.
--
-- Drops the unified discovery RPC. The execute grant on
-- private.unaccent_imm is revoked from the API roles again because this
-- migration was the only reason API roles needed to run it directly; the
-- search surface's SECURITY DEFINER builders are unaffected. Not registered
-- with the Supabase CLI (this directory is outside its glob); apply by hand
-- with psql when rolling back.

drop function if exists search_discover(
  text, double precision, double precision, integer, discipline[], integer[],
  date, date, boolean, signup_method[], age_restriction[], integer, integer, integer
);

drop function if exists private.search_fuzzy_hits(text);

revoke execute on function private.unaccent_imm(text)
  from anon, authenticated, service_role;
