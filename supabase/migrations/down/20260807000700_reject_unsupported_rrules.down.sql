-- Down migration for 20260807000700_reject_unsupported_rrules.sql.
--
-- Drops the boundary check. Rolling this back makes it possible again to
-- store a recurrence rule the generator cannot honour, which produces a
-- listing that exists and generates no nights, with no error anywhere.
--
-- Not registered with the Supabase CLI (this directory is outside its glob);
-- apply by hand with psql when rolling back.

drop trigger if exists mic_series_rrule_check on mic_series;
drop function if exists private.validate_rrule();
