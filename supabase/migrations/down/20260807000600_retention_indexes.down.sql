-- Down migration for 20260807000600_retention_indexes.sql.
--
-- Dropping an index cannot change a result, only a plan, so this is the one
-- rollback in the set with no behavioural consequence at all.
--
-- Not registered with the Supabase CLI (this directory is outside its glob);
-- apply by hand with psql when rolling back.

drop index if exists favorites_series_idx;
drop index if exists profiles_home_location_gist;
