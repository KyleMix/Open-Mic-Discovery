-- LOCAL VERIFICATION HARNESS ONLY. Never applied to a real Supabase project.
--
-- Reproduces the parts of the Supabase platform environment that our
-- migrations and RLS tests depend on, so the migration set runs against a
-- plain Postgres 16 + PostGIS instance when Docker is unavailable:
--   1. API roles (anon, authenticated, service_role) and the default
--      privileges Supabase grants them.
--   2. The auth schema: a minimal auth.users/auth.identities, and
--      auth.uid()/auth.role() reading request.jwt.claims, exactly as the
--      platform implements them.
-- Tests impersonate users with:
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<uuid>"}', true);

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;

create table if not exists auth.users (
  id                          uuid primary key,
  instance_id                 uuid,
  aud                         text,
  role                        text,
  email                       text unique,
  encrypted_password          text,
  email_confirmed_at          timestamptz,
  raw_app_meta_data           jsonb,
  raw_user_meta_data          jsonb,
  created_at                  timestamptz,
  updated_at                  timestamptz,
  confirmation_token          text,
  recovery_token              text,
  email_change                text,
  email_change_token_new      text,
  email_change_token_current  text,
  phone_change                text,
  phone_change_token          text,
  reauthentication_token      text
);

create table if not exists auth.identities (
  id               uuid primary key,
  user_id          uuid references auth.users (id),
  provider_id      text,
  provider         text,
  identity_data    jsonb,
  last_sign_in_at  timestamptz,
  created_at       timestamptz,
  updated_at       timestamptz
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''),
    'anon'
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- Supabase provisions this publication for Realtime; the shim mirrors it.
create publication supabase_realtime;

-- Minimal storage schema so migrations can create buckets and object
-- policies. Mirrors the platform tables' columns that our code touches.
create schema if not exists storage;

create table if not exists storage.buckets (
  id          text primary key,
  name        text not null,
  public      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table storage.objects enable row level security;

-- The platform's path helper: every path segment except the file name.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

-- The real storage service forbids deleting object rows from SQL (the API
-- is the only honest delete path: a row delete would orphan the file), and
-- hides bucket rows from the API roles behind RLS. Emulate both so the
-- pgTAP suite behaves here exactly as it does against the full stack.
create or replace function storage.protect_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
    using errcode = '42501',
          hint = 'This prevents accidental data loss from orphaned objects.';
end;
$$;
create trigger objects_protect_delete
  before delete on storage.objects
  for each row execute function storage.protect_delete();
alter table storage.buckets enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
