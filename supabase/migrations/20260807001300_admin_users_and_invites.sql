-- The admin allowlist: who may reach the console, at what role, and how they
-- got there.
--
-- Requirement S2 (no self signup, invite only from an allowlist), the role model
-- from the brief (owner does everything including managing admins, moderator
-- moderates, read_only writes nothing), and v1 feature 5 (invite, change role,
-- deactivate, owner only, and an admin may not modify their own role or
-- deactivate themselves).
--
-- Both tables live in the `admin` schema alongside audit_log, so neither is
-- reachable through the Data API and neither inherits the default privileges
-- that 20260728001200 applies to schema public. service_role gets SELECT so the
-- console can list admins and invites. Every mutation goes through a SECURITY
-- DEFINER function in `public` that checks authorization in its own body and
-- appends an audit row, which is the S5 and S6 shape the audit log migration set
-- up and tested.
--
-- ---------------------------------------------------------------------------
-- The one genuinely delicate part: two places that say who is an admin
-- ---------------------------------------------------------------------------
--
-- profiles.is_admin is read by private.is_admin(), which around 25 row level
-- security policies in `public` call. admin.admin_users is now the source of
-- truth. Left alone, those are two facts that can disagree, which is the defect
-- this project has spent two migrations removing elsewhere.
--
-- Rejected: rewriting those 25 policies to read the allowlist directly. It is
-- the right end state, but the same policies have to be rewritten again for
-- user_sanctions, and rewriting them twice is how a policy gets missed. That
-- pass happens once, with sanctions.
--
-- Taken instead: profiles.is_admin becomes a cache with exactly one definition,
-- private.admin_bit_for(user_id), which is "an active allowlist row whose role
-- is owner or moderator". That definition is applied in two places and nowhere
-- else:
--
--   1. private.guard_profile_writes() now DERIVES the column from the allowlist
--      on every write that carries a session, where 20260807001000 pinned it to
--      its previous value. F-B stays closed, and more tightly than before: a
--      session write cannot set the column to anything except what the
--      allowlist says, so the cache cannot be poisoned even by an admin.
--   2. A trigger on admin.admin_users re-derives it when the allowlist changes.
--      That write passes through the guard, which computes the same value, so
--      the two agree by construction rather than by discipline.
--
-- read_only therefore lands with is_admin = false, which is the fail-safe
-- direction: a read_only admin gets nothing at all from the existing policies
-- rather than the write access is_admin would confer. What that also means,
-- stated plainly rather than left to be found: a read_only admin cannot read the
-- queue through row level security either, and reads nothing until the console's
-- own read path exists. Section 9 of docs/admin/SCHEMA-REPORT.md carries this.
--
-- ---------------------------------------------------------------------------
-- Not in this migration
-- ---------------------------------------------------------------------------
--
-- Step-up reauthentication (S8). Granting an admin role is at least as
-- destructive as the actions S8 names, and the check belongs in
-- admin.require_owner(). It is absent rather than stubbed, because a check that
-- returns true unconditionally looks like a control and is not one. It cannot be
-- written yet: TOTP is disabled on the project (`[auth.mfa.totp]`,
-- enroll_enabled and verify_enabled both false), so no session can reach aal2
-- and any real check would make these functions uncallable. When MFA is enabled
-- the check reads the amr claim's TOTP timestamp and refuses anything older than
-- five minutes, in require_owner, where every mutation below already passes.
--
-- Down migration:
-- supabase/migrations/down/20260807001300_admin_users_and_invites.down.sql

-- ---------------------------------------------------------------------------
-- 1. The allowlist
--
-- No foreign key on user_id or created_by, for the reason audit_log gave: these
-- rows have to outlive changes elsewhere, and an allowlist that a cascade can
-- silently empty is worse than one with a dangling id. The RPCs below check that
-- the user exists, which is where that belongs.
-- ---------------------------------------------------------------------------
create table admin.admin_users (
  user_id     uuid primary key,
  role        admin.admin_role not null,
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index admin_users_active_idx on admin.admin_users (role) where active;

create trigger admin_users_updated_at before update on admin.admin_users
  for each row execute function private.set_updated_at();

revoke all on admin.admin_users from public;
grant select on admin.admin_users to service_role;
-- No insert, update or delete for any role. The RPCs below are definer owned and
-- bypass the missing grant, which makes them the only write path.

alter table admin.admin_users enable row level security;

comment on table admin.admin_users is
  'Who may use the moderation console, and at what role. Source of truth; '
  'profiles.is_admin is a cache of it, defined by private.admin_bit_for().';

-- ---------------------------------------------------------------------------
-- 2. Invitations
--
-- The token is never stored. admin_invite() returns it once, and only its
-- SHA-256 hash lands here, so a database leak does not hand over usable
-- invitations. Hashing uses the built-in sha256(), not pgcrypto's digest(),
-- which keeps search_path pinned to '' instead of widening it to reach an
-- extension whose schema differs between the local stack and hosted Supabase.
-- ---------------------------------------------------------------------------
create table admin.admin_invites (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null,
  role         admin.admin_role not null,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz not null,
  invited_by   uuid not null,
  created_at   timestamptz not null default now(),
  consumed_at  timestamptz,
  consumed_by  uuid,
  revoked_at   timestamptz,
  check (expires_at > created_at),
  -- An invitation cannot be both taken up and withdrawn.
  check (consumed_at is null or revoked_at is null),
  check ((consumed_at is null) = (consumed_by is null))
);

-- One live invitation per address. A second one is a mistake worth an error
-- rather than two tokens that both work.
create unique index admin_invites_one_live_per_email
  on admin.admin_invites (email)
  where consumed_at is null and revoked_at is null;

create index admin_invites_pending_idx on admin.admin_invites (expires_at)
  where consumed_at is null and revoked_at is null;

revoke all on admin.admin_invites from public;
grant select on admin.admin_invites to service_role;

alter table admin.admin_invites enable row level security;

comment on table admin.admin_invites is
  'Single-use console invitations. Only the SHA-256 hash of the token is '
  'stored; admin_invite() returns the token once and it cannot be recovered.';

-- ---------------------------------------------------------------------------
-- 3. The one definition of profiles.is_admin
-- ---------------------------------------------------------------------------
create or replace function private.admin_bit_for(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from admin.admin_users a
    where a.user_id = p_user_id
      and a.active
      and a.role in ('owner', 'moderator')
  );
$$;

-- Callable only from the definer functions that need it. Left reachable it would
-- answer "is this person a moderator" about anybody who asked.
revoke all on function private.admin_bit_for(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The guard derives the cache instead of pinning it
--
-- Body otherwise identical to 20260807001000. The single changed statement is
-- the is_admin assignment, which now reads the allowlist for both INSERT and
-- UPDATE rather than forcing false and restoring the old value.
-- ---------------------------------------------------------------------------
create or replace function private.guard_profile_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    -- The allowlist decides, for everyone, on every path that has a session.
    -- The owner bootstrap trigger sorts after this one and is the only thing
    -- that may set the bit without an allowlist row already existing, which is
    -- how a brand new database gets its first admin.
    new.is_admin := private.admin_bit_for(new.id);

    if not private.is_admin() then
      if tg_op = 'INSERT' then
        new.eula_accepted_at := now();
        new.moderation_status := case
          when private.text_is_clean(new.display_name, new.bio, new.handle::text)
               and private.text_is_clean(new.stage_name, null, null)
          then 'approved' else 'pending' end;
      else
        if new.moderation_status is distinct from old.moderation_status then
          new.moderation_status := old.moderation_status;
        end if;
        if new.eula_version is distinct from old.eula_version then
          new.eula_accepted_at := now();
        else
          new.eula_accepted_at := old.eula_accepted_at;
        end if;
        if new.display_name is distinct from old.display_name
           or new.stage_name is distinct from old.stage_name
           or new.bio is distinct from old.bio
           or new.handle is distinct from old.handle then
          new.moderation_status := case
            when private.text_is_clean(new.display_name, new.bio, new.handle::text)
                 and private.text_is_clean(new.stage_name, null, null)
            then 'approved' else 'pending' end;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function private.guard_profile_writes() is
  'Field level integrity on profiles. is_admin is derived from '
  'admin.admin_users on every write that carries a session, so it cannot be '
  'set by anyone through the API, including an admin, and cannot drift from '
  'the allowlist.';

-- ---------------------------------------------------------------------------
-- 5. The allowlist keeps the cache honest in the other direction
-- ---------------------------------------------------------------------------
create or replace function admin.sync_admin_bit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles p
     set is_admin = private.admin_bit_for(v_user)
   where p.id = v_user
     and p.is_admin is distinct from private.admin_bit_for(v_user);
  return null;
end;
$$;

create trigger admin_users_sync_profile
  after insert or update or delete on admin.admin_users
  for each row execute function admin.sync_admin_bit();

-- ---------------------------------------------------------------------------
-- 6. The actor's role now comes from the allowlist
--
-- This replaces the derivation admin.actor_role() carried in 20260807001200,
-- which read the owner email and is_admin because those were the only facts the
-- database had. The two exception messages are unchanged so the audit log's
-- assertions keep meaning what they say.
--
-- read_only is a valid actor here on purpose. A read_only admin performs no
-- mutations, but S12 requires an audit row when one of them reveals a masked
-- email address, and an actor the log cannot record is an action the log cannot
-- hold anyone to.
-- ---------------------------------------------------------------------------
create or replace function admin.actor_role()
returns admin.admin_role
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_role admin.admin_role;
begin
  if v_uid is null then
    raise exception 'an audit entry needs a session: there is no actor here'
      using errcode = '42501';
  end if;
  select a.role into v_role
    from admin.admin_users a
   where a.user_id = v_uid and a.active;
  if v_role is null then
    raise exception 'only an admin can be the actor on an audit entry'
      using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- Owner gate for everything in section 9.
create or replace function admin.require_owner()
returns uuid
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- When MFA is enabled this is also where the S8 freshness check goes.
  if v_uid is null or not exists (
    select 1 from admin.admin_users a
    where a.user_id = v_uid and a.active and a.role = 'owner'
  ) then
    raise exception 'only an owner can manage admins' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

revoke all on function admin.actor_role() from public;
revoke all on function admin.require_owner() from public;

-- ---------------------------------------------------------------------------
-- 7. Tokens
--
-- gen_random_uuid() draws from the same strong random source pgcrypto would,
-- and two of them give around 244 bits, so guessing is not a threat model. Both
-- helpers are unreachable except from the definer functions below.
-- ---------------------------------------------------------------------------
create or replace function private.new_invite_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(pg_catalog.gen_random_uuid()::text, '-', '')
      || replace(pg_catalog.gen_random_uuid()::text, '-', '');
$$;

create or replace function private.invite_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_token, 'utf8')), 'hex');
$$;

revoke all on function private.new_invite_token() from public, anon, authenticated;
revoke all on function private.invite_token_hash(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Backfill, and the bootstrap seeds the allowlist on a new database
-- ---------------------------------------------------------------------------
insert into admin.admin_users (user_id, role, active, created_by)
select p.id,
       case when private.is_owner_email(u.email) then 'owner' else 'moderator' end
         ::admin.admin_role,
       true,
       null
from public.profiles p
join auth.users u on u.id = p.id
where p.is_admin
on conflict (user_id) do nothing;

-- The owner bootstrap already creates the performer and producer rows for a
-- first sign-in on the owner address. It now creates the allowlist row too,
-- because without it profiles.is_admin and the allowlist would disagree from the
-- very first account on a fresh database. Body otherwise copied verbatim from
-- 20260807000400.
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
    insert into admin.admin_users (user_id, role, active, created_by)
      values (new.id, 'owner', true, null)
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. The mutations. Owner only, audited, and none of them can be aimed at the
-- caller's own row.
--
-- Every one of these is granted to `authenticated` and revoked from `anon`
-- explicitly, because the default privileges in 20260728001200 hand EXECUTE on
-- every new public function to anon. admin_invite_accept is the one that a
-- caller who is not yet an admin must be able to reach.
-- ---------------------------------------------------------------------------

create or replace function admin_invite(
  p_email text,
  p_role text,
  p_reason text,
  p_request_ip inet,
  p_expires_in interval default interval '72 hours'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := admin.require_owner();
  v_role admin.admin_role;
  v_email public.citext := lower(btrim(coalesce(p_email, '')))::public.citext;
  v_token text;
  v_id uuid;
begin
  if p_role not in ('owner', 'moderator', 'read_only') then
    raise exception 'role must be owner, moderator or read_only, not %', p_role
      using errcode = '22P02';
  end if;
  v_role := p_role::admin.admin_role;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that does not look like an email address'
      using errcode = '22P02';
  end if;

  if exists (
    select 1 from admin.admin_users a
    join auth.users u on u.id = a.user_id
    where u.email::public.citext = v_email and a.active
  ) then
    raise exception 'that address is already an active admin'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from admin.admin_invites i
    where i.email = v_email and i.consumed_at is null and i.revoked_at is null
  ) then
    raise exception 'that address already has a live invitation. Revoke it first.'
      using errcode = '23505';
  end if;

  v_token := private.new_invite_token();

  insert into admin.admin_invites (email, role, token_hash, expires_at, invited_by)
  values (v_email, v_role, private.invite_token_hash(v_token),
          now() + p_expires_in, v_actor)
  returning id into v_id;

  -- The token is deliberately absent from the audit row: the log is readable by
  -- the console and an invitation in it would be a usable credential.
  perform admin.append_audit(
    'admin.invite', 'admin_invite', v_id,
    null,
    jsonb_build_object('email', v_email::text, 'role', v_role::text,
                       'expires_at', now() + p_expires_in),
    p_reason, p_request_ip);

  return v_token;
end;
$$;

create or replace function admin_invite_revoke(
  p_invite_id uuid,
  p_reason text,
  p_request_ip inet
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := admin.require_owner();
  v_invite admin.admin_invites%rowtype;
begin
  select * into v_invite from admin.admin_invites
   where id = p_invite_id and consumed_at is null and revoked_at is null;
  if not found then
    raise exception 'no live invitation with that id' using errcode = 'P0002';
  end if;

  update admin.admin_invites set revoked_at = now() where id = p_invite_id;

  perform admin.append_audit(
    'admin.invite_revoke', 'admin_invite', p_invite_id,
    jsonb_build_object('email', v_invite.email::text, 'role', v_invite.role::text),
    null, p_reason, p_request_ip);
end;
$$;

-- Called by the invited person, from their own session, before they are an
-- admin. The token proves the invitation and the session proves the address:
-- neither alone is enough, so a leaked token cannot be redeemed by whoever
-- happens to hold it.
create or replace function admin_invite_accept(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email public.citext;
  v_invite admin.admin_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select u.email::public.citext into v_email
    from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'confirm your email address first' using errcode = '42501';
  end if;

  select * into v_invite from admin.admin_invites
   where token_hash = private.invite_token_hash(coalesce(p_token, ''))
     and consumed_at is null
     and revoked_at is null;
  if not found then
    raise exception 'that invitation is not valid' using errcode = 'P0002';
  end if;

  -- Expiry is distinguished from invalid on purpose. With a 244-bit token there
  -- is no guessing to protect against, and an invited person whose link went
  -- stale needs to be told that rather than left wondering.
  if v_invite.expires_at <= now() then
    raise exception 'that invitation expired on %', v_invite.expires_at
      using errcode = '22023';
  end if;

  if v_invite.email <> v_email then
    raise exception 'that invitation was issued to a different address'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from admin.admin_users a where a.user_id = v_uid and a.active
  ) then
    raise exception 'you are already an admin' using errcode = '23505';
  end if;

  -- A previously deactivated admin who is invited again comes back at the role
  -- the new invitation names, not the one they used to hold.
  insert into admin.admin_users (user_id, role, active, created_by)
  values (v_uid, v_invite.role, true, v_invite.invited_by)
  on conflict (user_id) do update
    set role = excluded.role,
        active = true,
        created_by = excluded.created_by,
        updated_at = now();

  update admin.admin_invites
     set consumed_at = now(), consumed_by = v_uid
   where id = v_invite.id;

  -- The allowlist row exists by now, so admin.actor_role() resolves and the
  -- new admin is the actor on their own onboarding.
  perform admin.append_audit(
    'admin.invite_accept', 'admin_user', v_uid,
    null,
    jsonb_build_object('role', v_invite.role::text, 'invite_id', v_invite.id),
    format('Accepted the invitation issued to %s.', v_invite.email),
    null);

  return v_invite.role::text;
end;
$$;

create or replace function admin_set_role(
  p_user_id uuid,
  p_role text,
  p_reason text,
  p_request_ip inet
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := admin.require_owner();
  v_role admin.admin_role;
  v_before admin.admin_users%rowtype;
begin
  if p_user_id = v_actor then
    raise exception 'you cannot change your own role' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'moderator', 'read_only') then
    raise exception 'role must be owner, moderator or read_only, not %', p_role
      using errcode = '22P02';
  end if;
  v_role := p_role::admin.admin_role;

  select * into v_before from admin.admin_users where user_id = p_user_id;
  if not found then
    raise exception 'that person is not on the admin allowlist'
      using errcode = 'P0002';
  end if;
  if v_before.role = v_role then
    raise exception 'they already hold that role' using errcode = '23514';
  end if;

  update admin.admin_users set role = v_role where user_id = p_user_id;

  perform admin.append_audit(
    'admin.set_role', 'admin_user', p_user_id,
    jsonb_build_object('role', v_before.role::text, 'active', v_before.active),
    jsonb_build_object('role', v_role::text, 'active', v_before.active),
    p_reason, p_request_ip);
end;
$$;

create or replace function admin_set_active(
  p_user_id uuid,
  p_active boolean,
  p_reason text,
  p_request_ip inet
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := admin.require_owner();
  v_before admin.admin_users%rowtype;
begin
  -- Together with owner-only management, this is what keeps at least one active
  -- owner in the allowlist at all times: the only person who could remove the
  -- last owner is that owner, and they cannot aim this at themselves.
  if p_user_id = v_actor then
    raise exception 'you cannot deactivate yourself' using errcode = '42501';
  end if;

  select * into v_before from admin.admin_users where user_id = p_user_id;
  if not found then
    raise exception 'that person is not on the admin allowlist'
      using errcode = 'P0002';
  end if;
  if v_before.active = p_active then
    raise exception 'their access is already %',
      case when p_active then 'active' else 'switched off' end
      using errcode = '23514';
  end if;

  update admin.admin_users set active = p_active where user_id = p_user_id;

  perform admin.append_audit(
    case when p_active then 'admin.reactivate' else 'admin.deactivate' end,
    'admin_user', p_user_id,
    jsonb_build_object('role', v_before.role::text, 'active', v_before.active),
    jsonb_build_object('role', v_before.role::text, 'active', p_active),
    p_reason, p_request_ip);
end;
$$;

revoke all on function admin_invite(text, text, text, inet, interval)
  from public, anon;
revoke all on function admin_invite_revoke(uuid, text, inet) from public, anon;
revoke all on function admin_invite_accept(text) from public, anon;
revoke all on function admin_set_role(uuid, text, text, inet) from public, anon;
revoke all on function admin_set_active(uuid, boolean, text, inet) from public, anon;

grant execute on function admin_invite(text, text, text, inet, interval)
  to authenticated, service_role;
grant execute on function admin_invite_revoke(uuid, text, inet)
  to authenticated, service_role;
grant execute on function admin_invite_accept(text)
  to authenticated, service_role;
grant execute on function admin_set_role(uuid, text, text, inet)
  to authenticated, service_role;
grant execute on function admin_set_active(uuid, boolean, text, inet)
  to authenticated, service_role;
