-- Revert: nothing to undo safely. This migration only reasserts the intended
-- end state (API roles read spatial_ref_sys, never write), which matches the
-- earlier lock migrations. Re-granting writes to anon would reintroduce the
-- vulnerability, so the down migration is a deliberate no-op.
select 1;
