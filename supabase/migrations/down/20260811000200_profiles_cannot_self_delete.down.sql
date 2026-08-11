-- Revert: restore the WITH CHECK that omitted deleted_at, so a user could once
-- again set it on their own profile through the API.

drop policy "profiles owner update" on profiles;
create policy "profiles owner update" on profiles
  for update to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));
