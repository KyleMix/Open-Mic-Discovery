-- Reverses 20260807001100_report_triage.sql.
--
-- Drops the triage table, the severity column and its enum, the guard trigger,
-- and the three indexes. Applying this loses every assignment and resolution
-- note that has been written, so it is a rollback for a migration that has just
-- landed badly, not a way to retire the feature after it has been used.
--
-- Note what comes back with it: resolved_by on reports becomes client supplied
-- again, so the audit stamp on a resolved report is once more a claim rather
-- than a fact.

drop trigger if exists reports_guard on reports;
drop function if exists private.guard_report_writes();

drop table if exists report_triage;

drop index if exists reports_severity_idx;
drop index if exists reports_target_idx;

alter table reports drop column if exists severity;

drop function if exists private.report_severity_for(public.report_reason);
drop type if exists report_severity;
-- The column comment goes with the column, so there is nothing left to clear.
