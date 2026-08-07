-- Down migration for 20260807000400_test_kit_off_by_default.sql.
--
-- Restores the column default and both bootstrap function bodies exactly as
-- 20260801000100_test_kit.sql defined them.
--
-- It deliberately does NOT switch the kill switch back on for existing rows.
-- Rolling a migration back is a recovery action; re-enabling a facility that
-- mints sign-ins is a decision, and it belongs to whoever is sitting at the
-- test kit screen, which is one tap away. Restoring the default is enough to
-- put a freshly created database back where it was.
--
-- Not registered with the Supabase CLI (this directory is outside its glob);
-- apply by hand with psql when rolling back.

alter table test_kit_settings alter column enabled set default true;

create or replace function private.bootstrap_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_owner_email((select u.email from auth.users u where u.id = new.id)) then
    new.is_admin := true;
    new.is_performer := true;
    new.is_producer := true;
    new.moderation_status := 'approved';
  end if;
  return new;
end;
$$;

create or replace function private.bootstrap_owner_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_admin and private.is_owner_email(
       (select u.email from auth.users u where u.id = new.id)) then
    insert into public.performer_profiles (profile_id) values (new.id)
      on conflict (profile_id) do nothing;
    insert into public.producer_profiles (profile_id, verified) values (new.id, true)
      on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;
