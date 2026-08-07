-- Reverses 20260807001200_audit_log.sql.
--
-- Read this before running it. The up migration builds a table whose whole
-- purpose is that its contents cannot be altered or removed, and this script
-- removes them: `drop schema admin cascade` deletes every audit row along with
-- the table, and the append-only triggers do not fire on DROP. That is the
-- correct behaviour for backing out a migration that has just landed and has
-- written nothing, and it is the wrong thing to run against a log that has real
-- entries in it.
--
-- If the log holds entries you need to keep, copy them out first:
--
--   \copy (select * from admin.audit_log order by id) to 'audit_log.csv' csv header
--
-- and record in the runbook where that file went and who has it.

drop schema if exists admin cascade;
