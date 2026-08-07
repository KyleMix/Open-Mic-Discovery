-- The test kit ships switched off, and the owner bootstrap requires a
-- confirmed email address.
--
-- Audit finding F-001 (docs/audit/FINDINGS.md). Two facts that are each
-- defensible alone combined into a standing backdoor:
--
--   1. private.bootstrap_owner_profile (20260801000100) grants is_admin to
--      whoever holds the owner email at the moment a profile row is inserted.
--      The only lock on that is whether the project requires email
--      confirmation, which is a hosted setting no migration can see, and the
--      committed supabase/config.toml turns it off for the local stack.
--   2. test_kit_settings.enabled defaulted to true, so every environment the
--      migrations touch had the kit live. The kit inserts auth.users rows
--      with a password that is written down in a migration, so an admin
--      account is enough to mint sign-ins at will.
--
-- Nothing about the authorization logic was wrong. private.is_admin() is
-- checked at every entry point and cannot be self-granted, and the kill
-- switch worked exactly as designed. Only the two defaults were wrong, which
-- is what this migration changes.
--
-- No entry point changes signature or behaviour here, so
-- private.test_kit_version() and EXPECTED_KIT_VERSION in
-- src/features/testkit/queries.ts both stay at 4.
--
-- Down migration:
-- supabase/migrations/down/20260807000400_test_kit_off_by_default.down.sql

-- ---------------------------------------------------------------------------
-- 1. The kill switch defaults to off.
--
-- The update covers databases that already carry the row, which every
-- environment does: the settings table holds exactly one row, pinned by
-- `id boolean primary key default true check (id)`.
--
-- Turning it back on is one tap on the test kit screen, and
-- test_kit_set_enabled only requires is_admin(), never the switch itself, so
-- this is not a one-way door.
-- ---------------------------------------------------------------------------
alter table test_kit_settings alter column enabled set default false;

update test_kit_settings
set enabled = false, updated_at = now()
where enabled;

-- ---------------------------------------------------------------------------
-- 2. The owner bootstrap requires a confirmed address.
--
-- On a project that requires email confirmation this changes nothing about
-- the real path: a profile row can only be inserted from a session, a session
-- only exists after confirmation, and GoTrue stamps email_confirmed_at at
-- that point. On a project with confirmation disabled, GoTrue auto-confirms
-- at signup and stamps the same column. What the predicate closes is the
-- narrower case of a profile row reaching this table while the address behind
-- it is still unproven.
--
-- Both functions are otherwise copied verbatim from 20260801000100, including
-- the producer row landing with verified = true. Whether the owner's own
-- listings should carry a permanent search-ranking advantage is a separate
-- open question (docs/audit/PLAN.md, decision 9) and is deliberately not
-- touched here.
-- ---------------------------------------------------------------------------

-- BEFORE INSERT, named to sort after profiles_guard so it runs second: the
-- guard pins is_admin to false for self-serve sign-ups, and this puts it back
-- for the owner.
create or replace function private.bootstrap_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from auth.users u
    where u.id = new.id
      and u.email_confirmed_at is not null
      and private.is_owner_email(u.email)
  ) then
    new.is_admin := true;
    new.is_performer := true;
    new.is_producer := true;
    new.moderation_status := 'approved';
  end if;
  return new;
end;
$$;

-- The performer and producer child rows, so the owner can create a listing
-- and sign up for one the moment onboarding finishes.
create or replace function private.bootstrap_owner_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_admin and exists (
    select 1
    from auth.users u
    where u.id = new.id
      and u.email_confirmed_at is not null
      and private.is_owner_email(u.email)
  ) then
    insert into public.performer_profiles (profile_id) values (new.id)
      on conflict (profile_id) do nothing;
    insert into public.producer_profiles (profile_id, verified) values (new.id, true)
      on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;
