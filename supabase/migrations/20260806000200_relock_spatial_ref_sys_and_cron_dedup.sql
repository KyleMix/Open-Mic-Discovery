-- Two fixes the full Supabase stack surfaced after the merge.
--
-- 1. spatial_ref_sys write access, taken away for real this time.
--
-- 20260801000700 revoked insert/update/delete from the API roles, but
-- privileges are tracked per grantor. On the Supabase stack, `create
-- extension postgis` is re-executed by the platform's extension machinery,
-- so the table is owned by (and its API-role grants come from) the
-- platform admin role, not the role running migrations. A revoke issued by
-- the migration role cannot remove another grantor's grant: it silently
-- does nothing, and grants-and-rls.test.sql catches the still-open write
-- access. Repeat the revoke as the table's owner, when that role can be
-- assumed; the pgTAP suite remains the arbiter of whether it worked.
do $$
declare
  v_owner name;
begin
  select relowner::regrole::name into v_owner
  from pg_class where oid = 'public.spatial_ref_sys'::regclass;

  -- As ourselves first: covers plain-Postgres dev databases where the
  -- migration role created the extension and holds the grants.
  revoke all on public.spatial_ref_sys from anon, authenticated;
  grant select on public.spatial_ref_sys to anon, authenticated;

  if v_owner is distinct from current_user then
    begin
      execute format('set local role %I', v_owner);
      revoke all on public.spatial_ref_sys from anon, authenticated;
      grant select on public.spatial_ref_sys to anon, authenticated;
      reset role;
    exception when insufficient_privilege then
      -- Cannot become the owner here; leave the grants for the test suite
      -- to flag rather than failing the whole migration run.
      reset role;
    end;
  end if;
end $$;

-- 2. One outbox drain, not two.
--
-- Both development lines scheduled a minute cron that posts the
-- notification outbox to the push-sender Edge Function: 20260801000900
-- as drain-notification-outbox (the newer, batched drain) and
-- 20260803000700 as push-sender. Running both delivers the same batch to
-- the function twice a minute and races the sent_at update. Keep the
-- batched drain; unschedule the duplicate.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'push-sender') then
      perform cron.unschedule('push-sender');
    end if;
  end if;
end $$;
