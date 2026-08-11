-- A user must not be able to soft-delete their own profile through the API.
--
-- The bug (pre-launch audit finding 5). `profiles owner update` USING is
-- `id = auth.uid() and deleted_at is null`, but its WITH CHECK is only
-- `id = auth.uid()`. Nothing stopped a client sending
-- `update profiles set deleted_at = now()`: USING passed on the live row, the
-- CHECK passed on the new one, and the write succeeded. USING then refuses
-- every later self-update (it requires `deleted_at is null`), so the row was
-- frozen: signed in, unusable, and in a state account deletion never produces
-- (auth user still live, profile orphaned, none of the anonymisation that
-- delete_account_for performs).
--
-- The fix belongs in RLS, not the guard trigger. The only legitimate writer of
-- deleted_at is private.delete_account_for, which is SECURITY DEFINER owned by
-- a superuser and so bypasses RLS entirely; adding the column to the WITH
-- CHECK blocks the API path without touching deletion. The trigger is the
-- wrong layer because delete_account_for runs with the deleted user's auth.uid
-- and is_admin() false, so a trigger pinning deleted_at for non-admins would
-- also block the real deletion.
--
-- Scope note: is_producer / is_performer are deliberately left self-settable.
-- Onboarding and the in-app role toggle both write them directly (a single
-- account holds both roles by design); they are not a claim on anyone else's
-- listing, so they are not a privilege-escalation vector and are not touched
-- here.
--
-- Down migration: supabase/migrations/down/20260811000200_profiles_cannot_self_delete.down.sql

drop policy "profiles owner update" on profiles;
create policy "profiles owner update" on profiles
  for update to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()) and deleted_at is null);
