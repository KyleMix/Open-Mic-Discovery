-- Down migration for 20260807000200_search_surface.sql.
--
-- Removes the search surface: triggers, sync functions, the series_search
-- table (policies and indexes go with it), and the unaccent wrapper. The
-- unaccent extension is left installed: extensions are shared machinery and
-- another migration may adopt it; dropping it here would make the down
-- destructive beyond what the up created if anything else starts using it.
-- Not registered with the Supabase CLI (this directory is outside its glob);
-- apply by hand with psql when rolling back.

drop trigger if exists profiles_search_sync on profiles;
drop trigger if exists venues_search_sync on venues;
drop trigger if exists mic_series_search_sync on mic_series;

drop function if exists private.series_search_sync_host();
drop function if exists private.series_search_sync_venue();
drop function if exists private.series_search_sync_series();
drop function if exists private.build_series_search(uuid);

drop table if exists series_search;

drop function if exists private.unaccent_imm(text);
