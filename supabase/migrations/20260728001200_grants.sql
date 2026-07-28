-- Explicit API role grants.
--
-- Supabase environments usually auto-grant table access to the API roles via
-- default privileges, but that mechanism depends on which role ran the
-- migrations and has proven fragile (local stacks returned 403 permission
-- denied on every REST call). Security does not live here: every table has
-- row level security with default-deny policies, verified by the pgTAP
-- suite. These grants only let the roles reach the tables so RLS can rule.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Policy helper functions live in the private schema; policies executed for
-- an API role need to run them (they are SECURITY DEFINER, so callers gain
-- no data access beyond what each function chooses to expose).
grant usage on schema private to anon, authenticated, service_role;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- Future objects created by later migrations inherit the same access.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- The outbox stays service-role only despite the blanket grant above: RLS is
-- enabled with no policies for API roles, so anon/authenticated reads and
-- writes are denied by default-deny regardless of the table grant.
