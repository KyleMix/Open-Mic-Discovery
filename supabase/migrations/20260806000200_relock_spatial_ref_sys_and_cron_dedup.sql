-- Two fixes the full Supabase stack surfaced after the merge.
--
-- 1. spatial_ref_sys write access, taken away for real this time.
--
-- 20260801000700 revoked insert/update/delete from the API roles, but
-- privileges are tracked per grantor, and a revoke only removes grants the
-- revoking role can act for. On the Supabase stack the postgis extension
-- (and so spatial_ref_sys) belongs to the platform admin role, and the
-- API-role write grants were recorded against grantors that are not the
-- migration role, so both earlier revokes silently did nothing and
-- grants-and-rls.test.sql kept catching the open write access.
--
-- Stop guessing who the grantor is: read the table's ACL, and for every
-- write grant held by anon, authenticated, or PUBLIC, become that grant's
-- actual grantor and revoke it. Anything that still cannot be revoked is
-- raised as a warning, and the pgTAP suite remains the arbiter.
do $$
declare
  v_grantor name;
  v_left int;
begin
  -- Belt and braces for plain-Postgres dev databases, where the migration
  -- role holds the grants itself.
  revoke all on public.spatial_ref_sys from anon, authenticated;
  grant select on public.spatial_ref_sys to anon, authenticated;

  for v_grantor in
    select distinct pg_get_userbyid(a.grantor)
    from pg_class c
    cross join lateral aclexplode(c.relacl) a
    where c.oid = 'public.spatial_ref_sys'::regclass
      and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
      and (a.grantee = 0  -- PUBLIC
           or a.grantee in ('anon'::regrole::oid, 'authenticated'::regrole::oid))
  loop
    begin
      execute format('set local role %I', v_grantor);
      revoke insert, update, delete, truncate, references, trigger
        on public.spatial_ref_sys from public, anon, authenticated;
    exception when others then
      raise warning 'could not revoke spatial_ref_sys writes as %: %', v_grantor, sqlerrm;
    end;
    reset role;
  end loop;

  select count(*) into v_left
  from pg_class c
  cross join lateral aclexplode(c.relacl) a
  where c.oid = 'public.spatial_ref_sys'::regclass
    and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    and (a.grantee = 0
         or a.grantee in ('anon'::regrole::oid, 'authenticated'::regrole::oid));
  if v_left > 0 then
    raise warning 'spatial_ref_sys still carries % API-role write grant(s)', v_left;
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
