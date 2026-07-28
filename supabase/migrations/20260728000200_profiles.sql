-- EULA versions, profiles, performer_profiles, producer_profiles.
-- RLS ships here, alongside the tables (see supabase/tests for the pgTAP
-- assertions that unauthorized roles cannot read or write).

create table eula_versions (
  version       text primary key,
  body_md       text not null,
  published_at  timestamptz not null default now()
);
alter table eula_versions enable row level security;
create policy "eula readable by everyone" on eula_versions
  for select to anon, authenticated using (true);
-- No insert/update/delete policies: EULA versions land via migrations only.

create table profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  handle             citext not null unique check (handle::text ~ '^[a-z0-9_]{3,30}$'),
  display_name       text not null check (char_length(display_name) between 1 and 60),
  avatar_url         text,
  bio                text check (char_length(bio) <= 500),
  home_city          text,
  home_location      geography(point, 4326),
  birth_year         smallint check (birth_year between 1900 and 2100),
  is_performer       boolean not null default false,
  is_producer        boolean not null default false,
  is_admin           boolean not null default false,
  eula_version       text not null references eula_versions (version),
  eula_accepted_at   timestamptz not null default now(),
  moderation_status  moderation_status not null default 'pending',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create trigger profiles_updated_at before update on profiles
  for each row execute function private.set_updated_at();

-- Admin check. SECURITY DEFINER so it can read profiles without recursing
-- into profiles RLS.
create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Block relationship check (blocks table lands in the safety migration; the
-- function is created there). Declared here conceptually; see 000500.

-- Server-side stamps a client cannot forge:
-- eula_accepted_at is always set by the server, is_admin cannot be
-- self-granted, and moderation_status resets to pending on user writes.
create or replace function private.guard_profile_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.is_admin := false;
      new.moderation_status := 'pending';
      new.eula_accepted_at := now();
    else
      new.is_admin := old.is_admin;
      if new.moderation_status is distinct from old.moderation_status then
        new.moderation_status := old.moderation_status;
      end if;
      if new.eula_version is distinct from old.eula_version then
        new.eula_accepted_at := now();
      else
        new.eula_accepted_at := old.eula_accepted_at;
      end if;
      -- Free text edits go back through the content filter.
      if new.display_name is distinct from old.display_name
         or new.bio is distinct from old.bio
         or new.handle is distinct from old.handle then
        new.moderation_status := 'pending';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before insert or update on profiles
  for each row execute function private.guard_profile_writes();

alter table profiles enable row level security;

-- Owner reads own full row. Everyone else reads through public_profiles.
create policy "profiles owner select" on profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles owner insert" on profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles owner update" on profiles
  for update to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));
create policy "profiles admin select" on profiles
  for select to authenticated using (private.is_admin());
create policy "profiles admin update" on profiles
  for update to authenticated using (private.is_admin());
-- No delete policy: account deletion is a service-role flow (Phase 5).

create table performer_profiles (
  profile_id   uuid primary key references profiles (id) on delete cascade,
  disciplines  discipline[] not null default '{}',
  experience   experience_level,
  links        jsonb not null default '[]',
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger performer_profiles_updated_at before update on performer_profiles
  for each row execute function private.set_updated_at();
alter table performer_profiles enable row level security;
create policy "performer profile owner all" on performer_profiles
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create table producer_profiles (
  profile_id     uuid primary key references profiles (id) on delete cascade,
  contact_email  text,
  contact_phone  text,   -- PRIVATE: owner-only via RLS; the public view omits it
  payout_ref     text,   -- opaque provider reference, never raw payment details
  verified       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger producer_profiles_updated_at before update on producer_profiles
  for each row execute function private.set_updated_at();

-- verified is server-granted only.
create or replace function private.guard_producer_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.verified := false;
    else
      new.verified := old.verified;
    end if;
  end if;
  return new;
end;
$$;
create trigger producer_profiles_guard before insert or update on producer_profiles
  for each row execute function private.guard_producer_writes();

alter table producer_profiles enable row level security;
create policy "producer profile owner all" on producer_profiles
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
create policy "producer profile admin select" on producer_profiles
  for select to authenticated using (private.is_admin());
