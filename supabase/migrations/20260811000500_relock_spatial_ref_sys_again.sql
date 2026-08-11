-- spatial_ref_sys, locked again for the current Supabase Postgres image.
--
-- 20260806000200 revoked the API-role write access by hunting the ACL's
-- grantors and becoming each to revoke. That held until CI moved to a newer
-- Supabase Postgres image, where the write grants are held under a grantor the
-- migration role can no longer `set role` to, so the revoke only warned and the
-- writes survived. grants-and-rls.test.sql catches it (anon can delete/insert,
-- authenticated can update spatial_ref_sys, which breaks nothing for the app
-- and lets an anon caller wipe the coordinate systems every distance query
-- needs).
--
-- Two changes from the earlier attempt:
--   * The first, non-loop revoke now also targets PUBLIC, not just anon and
--     authenticated. PostGIS grants on spatial_ref_sys usually ride on PUBLIC,
--     which the API roles inherit, so revoking them from the two roles by name
--     never removed the inherited write.
--   * The grantor loop is kept as the fallback for grants recorded against a
--     grantor the migration role can assume.
-- The intended end state is reasserted regardless: everyone reads, no API role
-- writes.
--
-- Whether this holds on a given image depends on who owns the grant. The
-- companion diag() in grants-and-rls.test.sql prints the surviving grantor and
-- whether the migration role can assume it, so a future failure is diagnosed in
-- the test output rather than guessed at.
--
-- Down migration: supabase/migrations/down/20260811000500_relock_spatial_ref_sys_again.down.sql
do $$
declare
  v_grantor name;
begin
  -- Grants the migration role itself made (the 20260728001200 blanket grant),
  -- now widened to PUBLIC so an inherited write is caught too.
  revoke insert, update, delete, truncate, references, trigger
    on public.spatial_ref_sys from public, anon, authenticated;

  -- Grants recorded under another grantor: become each one and revoke. A
  -- grantor the migration role cannot assume warns rather than aborting, so the
  -- migration still applies and the test remains the arbiter.
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
      raise warning 'relock spatial_ref_sys: could not revoke as %: %', v_grantor, sqlerrm;
    end;
    reset role;
  end loop;

  -- Reads must survive: PostGIS transforms and every ST_DWithin / <-> query
  -- read this table.
  grant select on public.spatial_ref_sys to anon, authenticated;
end $$;
