-- Down migration for 20260807000800_credit_report_target.sql.
--
-- THIS SCRIPT DELIBERATELY DOES NOTHING, and that is the honest answer rather
-- than a gap.
--
-- Postgres has no ALTER TYPE ... DROP VALUE. Removing an enum value means
-- creating a replacement type, altering every column that uses it, migrating
-- the data, dropping the old type, and recreating every policy, function
-- signature, and index that mentions it. report_target is referenced by the
-- reports table, its policies, and moderate_content. Doing all of that to
-- reverse a value that costs nothing to leave in place would be far more
-- dangerous than the thing it undoes.
--
-- This is the case the schema rule in 20260728000100 anticipates: "Enums are
-- additive-only after ship: add values with ALTER TYPE, never remove or
-- reorder." An unused enum value is inert. Nothing reads it once
-- 20260807000900 is rolled back, which is the down script that actually
-- matters here.
--
-- Not registered with the Supabase CLI (this directory is outside its glob).

do $$
begin
  raise notice 'report_target.credit is left in place: enum values are additive-only (see this file)';
end $$;
