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
  id                  uuid primary key,
  instance_id         uuid,
  aud                 text,
  role                text,
  email               text unique,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  raw_app_meta_data   jsonb,
  raw_user_meta_data  jsonb,
  created_at          timestamptz,
  updated_at          timestamptz
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
