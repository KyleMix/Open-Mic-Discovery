-- Undo 20260810000100. Telemetry only; dropping it loses share counts and
-- nothing else.
do $$ begin
  perform cron.unschedule('prune-share-events');
exception when others then
  null;
end $$;
drop function if exists private.prune_share_events();
drop table if exists share_events;
