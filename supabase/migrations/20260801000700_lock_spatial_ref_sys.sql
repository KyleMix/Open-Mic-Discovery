-- Take write access to PostGIS's reference table away from the API roles.
--
-- PostGIS creates spatial_ref_sys in the public schema, and
-- 20260728001200_grants.sql issues `grant all on all tables in schema public
-- to anon, authenticated, service_role`. That grant does not know the
-- difference between our tables and the extension's, so it handed anonymous
-- callers insert, update and delete on the table that defines every
-- coordinate system the database knows about.
--
-- Row level security is the only thing standing between the API roles and any
-- table in public, and spatial_ref_sys is the one table that cannot have it:
-- it belongs to the extension, not to us. So the grant itself has to be
-- narrowed instead.
--
-- Deleting from it would break ST_DWithin and the <-> ordering that every
-- discovery query depends on, which is to say it would break the product for
-- everyone, from an unauthenticated request.
--
-- Select stays. PostGIS reads this table during coordinate transforms, and
-- the discovery RPCs are security invoker, so the calling role needs it.

revoke all on public.spatial_ref_sys from anon, authenticated;
grant select on public.spatial_ref_sys to anon, authenticated;
