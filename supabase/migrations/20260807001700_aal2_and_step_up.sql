-- AAL2 and step-up reauthentication.
--
-- Requirements S3 (an AAL1 session reads nothing and writes nothing) and S8 (a
-- destructive action needs a fresh MFA challenge). Unblocked by the project
-- being on the Pro plan, which is where Supabase puts TOTP.
--
-- Neither of these needs the custom access token hook. `aal` and `amr` are
-- claims Supabase Auth issues natively; only the *role* claim (S4) needs a hook.
-- That matters because the hook would trade away something valuable: today the
-- role is not in the JWT, so revoking an admin takes effect immediately even for
-- a session already in flight (verified, and written into the runbook). This
-- migration deliberately does not touch that.
--
-- ---------------------------------------------------------------------------
-- Why this ships switched off
-- ---------------------------------------------------------------------------
--
-- If AAL2 were required the moment this migration applied, and nobody had
-- enrolled a TOTP factor yet, every admin path would refuse at once: no session
-- can reach aal2 without an enrolled factor. That is a lockout, not a control.
--
-- So it lands behind one flag, `admin.security_settings.require_aal2`, defaulting
-- to false, exactly the pattern `test_kit_settings.enabled` uses (20260807000400).
-- With the flag off, every predicate below behaves as it did yesterday and the
-- 666 assertions that existed before this migration still describe the truth.
-- Turning it on is one statement, after enrolling, and the procedure is in
-- docs/admin/RUNBOOK.md. Turning it back off is the same statement, which is the
-- way out if enrolment goes wrong.
--
-- A control that ships off is a control that can be forgotten, so it is named in
-- the runbook, in SECURITY-VERIFICATION.md, and in the report as outstanding
-- until the flag is on in production.
--
-- ---------------------------------------------------------------------------
-- One thing that cannot be verified from here
-- ---------------------------------------------------------------------------
--
-- The exact `method` string Supabase writes into `amr` after a TOTP challenge is
-- not something this environment can observe: it needs a live Pro project with a
-- factor enrolled. `admin.mfa_methods()` holds the accepted set in one place for
-- that reason. If the real claim says something else, that function is the only
-- edit, and SECURITY-VERIFICATION.md records this as the one assumption in the
-- chain that rests on documentation rather than on an executed test.
--
-- Down migration: supabase/migrations/down/20260807001700_aal2_and_step_up.down.sql

-- ---------------------------------------------------------------------------
-- 1. The switch
-- ---------------------------------------------------------------------------
create table admin.security_settings (
  id            boolean primary key default true check (id),
  require_aal2  boolean not null default false,
  updated_at    timestamptz not null default now()
);
insert into admin.security_settings (id) values (true);

revoke all on admin.security_settings from public;
grant select on admin.security_settings to service_role;

alter table admin.security_settings enable row level security;

comment on table admin.security_settings is
  'One row. require_aal2 turns S3 and S8 enforcement on. Ships false so that '
  'applying the migration cannot lock out an admin who has not enrolled a TOTP '
  'factor yet. Enrol first, then flip it: see docs/admin/RUNBOOK.md.';

-- The step-up window is deliberately not a column. The brief says five minutes,
-- and a configurable security window is a dial that only ever gets turned the
-- wrong way.
create or replace function admin.step_up_window()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '5 minutes'; $$;

-- The amr methods that count as a completed MFA challenge. One place, because
-- this is the one value here that could not be confirmed against a live project.
create or replace function admin.mfa_methods()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['totp', 'mfa/totp']::text[]; $$;

-- ---------------------------------------------------------------------------
-- 2. Reading the session
--
-- current_setting rather than auth.jwt(): that helper is defined as exactly this
-- on hosted Supabase, and the local verification harness
-- (scripts/db/shim-supabase.sql) provides auth.uid() and auth.role() but not
-- auth.jwt(). Reading the setting directly works identically in both, so the
-- tests exercise the real code path instead of a stand-in.
-- ---------------------------------------------------------------------------
create or replace function private.jwt_claims()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
$$;

create or replace function admin.session_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select private.jwt_claims() ->> 'aal';
$$;

-- The most recent completed MFA challenge in this session, from the amr claim.
-- Supabase records each authentication step as {"method": ..., "timestamp": ...}
-- with the timestamp in seconds since the epoch.
create or replace function admin.mfa_verified_at()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max(pg_catalog.to_timestamp((e ->> 'timestamp')::double precision))
    from pg_catalog.jsonb_array_elements(
           coalesce(private.jwt_claims() -> 'amr', '[]'::jsonb)) as e
   where e ->> 'method' = any (admin.mfa_methods());
$$;

-- SECURITY DEFINER because this is the only one of these helpers that reads a
-- table. Every caller today is itself a definer function, so the effective user
-- would already be the owner, but a predicate whose answer depends on who is
-- asking is the wrong shape for a security switch.
create or replace function admin.aal2_required()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((select s.require_aal2 from admin.security_settings s), false);
$$;

-- ---------------------------------------------------------------------------
-- 3. The two gates
-- ---------------------------------------------------------------------------

-- S3. Used by the predicates in section 4, so every admin policy inherits it.
create or replace function admin.has_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select not admin.aal2_required() or admin.session_aal() = 'aal2';
$$;

-- S8. Raises rather than returning false, because a destructive action wants an
-- error a human can read, not a silent denial.
create or replace function admin.require_step_up()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not admin.aal2_required() then
    return;
  end if;
  if admin.session_aal() <> 'aal2' then
    raise exception 'this action needs two factor authentication'
      using errcode = '42501';
  end if;
  v_at := admin.mfa_verified_at();
  if v_at is null or v_at < now() - admin.step_up_window() then
    raise exception
      'this action needs a fresh two factor challenge, within the last %',
      admin.step_up_window()
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function admin.step_up_window() from public;
revoke all on function admin.mfa_methods() from public;
revoke all on function admin.session_aal() from public;
revoke all on function admin.mfa_verified_at() from public;
revoke all on function admin.aal2_required() from public;
revoke all on function admin.has_aal2() from public;
revoke all on function admin.require_step_up() from public;

-- private.jwt_claims stays reachable: it reports only on the caller's own
-- session, and the two predicates in section 4 are evaluated as the querying
-- role inside a policy, so they need to be able to call it.
grant execute on function private.jwt_claims() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. S3, applied in one place each
--
-- Folding the AAL2 test into the two predicates every admin policy already calls
-- means all 29 of them inherit it without an edit, and the read and write split
-- from 20260807001500 is preserved exactly. An AAL1 admin session, once the flag
-- is on, sees what a non-admin sees and writes what a non-admin writes: nothing.
--
-- Note the reach of the second one. private.is_admin() is also consulted by the
-- profile and moderation guards and by moderate_content, so with the flag on an
-- AAL1 admin's own writes are treated as an ordinary user's (their free text goes
-- through the content filter) and moderate_content refuses them. That is what S3
-- asks for, stated so it is not a surprise.
-- ---------------------------------------------------------------------------
create or replace function private.is_admin_reader()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select admin.has_aal2() and exists (
    select 1
    from admin.admin_users a
    where a.user_id = auth.uid() and a.active
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select admin.has_aal2() and coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function private.is_admin() is
  'True for an active owner or moderator on a session that satisfies the AAL2 '
  'requirement. This is the WRITE predicate despite the name: read_only admins '
  'are excluded on purpose. For read policies use private.is_admin_reader().';

-- ---------------------------------------------------------------------------
-- 5. S8, applied to the destructive actions
--
-- The brief names banning a user, removing a listing, and granting a badge.
-- Mapped onto what exists: applying a suspension or a ban, and anything that
-- changes who can reach the console. A warning is not destructive and is left
-- alone, since making the cheapest action the most annoying one is how people
-- end up not warning anybody.
--
-- Bodies otherwise copied verbatim from 20260807001300 and 20260807001400.
-- ---------------------------------------------------------------------------
create or replace function admin.require_owner()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from admin.admin_users a
    where a.user_id = v_uid and a.active and a.role = 'owner'
  ) then
    raise exception 'only an owner can manage admins' using errcode = '42501';
  end if;
  -- Changing who can reach the console is as destructive as anything in S8.
  perform admin.require_step_up();
  return v_uid;
end;
$$;

create or replace function admin.require_moderator()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from admin.admin_users a
    where a.user_id = v_uid and a.active and a.role in ('owner', 'moderator')
  ) then
    raise exception 'only a moderator or an owner can sanction an account'
      using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

revoke all on function admin.require_owner() from public;
revoke all on function admin.require_moderator() from public;

-- A suspension or a ban needs the fresh challenge; a warning does not. Body
-- otherwise copied verbatim from 20260807001400, with one perform added after
-- the type is known.
create or replace function admin_sanction_apply(
  p_user_id uuid,
  p_type text,
  p_scope text,
  p_expires_at timestamptz,
  p_reason text,
  p_request_ip inet
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := admin.require_moderator();
  v_type public.sanction_type;
  v_scope public.sanction_scope;
  v_id uuid;
  v_paused uuid[] := '{}';
  v_audit bigint;
begin
  if p_type not in ('warned', 'suspended', 'banned') then
    raise exception 'type must be warned, suspended or banned, not %', p_type
      using errcode = '22P02';
  end if;
  if p_scope not in ('all_writes', 'signups', 'listings', 'reporting') then
    raise exception
      'scope must be all_writes, signups, listings or reporting, not %', p_scope
      using errcode = '22P02';
  end if;
  v_type := p_type::public.sanction_type;
  v_scope := p_scope::public.sanction_scope;

  -- Taking somebody's access away is the S8 case. A warning is not.
  if v_type in ('suspended', 'banned') then
    perform admin.require_step_up();
  end if;

  if p_user_id = v_actor then
    raise exception 'you cannot sanction yourself' using errcode = '42501';
  end if;

  if exists (
    select 1 from admin.admin_users a where a.user_id = p_user_id and a.active
  ) then
    raise exception
      'that account is an admin. Take their console access away first, with '
      'admin_set_active.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'no live account with that id' using errcode = 'P0002';
  end if;

  if v_type = 'suspended' then
    if p_expires_at is null then
      raise exception 'a suspension needs an end date' using errcode = '23514';
    end if;
    if p_expires_at <= now() then
      raise exception 'a suspension has to end in the future' using errcode = '23514';
    end if;
  elsif p_expires_at is not null then
    raise exception
      'only a suspension carries an end date. A warning is a record and a ban '
      'runs until it is lifted.'
      using errcode = '23514';
  end if;

  if v_type in ('suspended', 'banned') and exists (
    select 1 from public.user_sanctions s
    where s.user_id = p_user_id
      and s.type in ('suspended', 'banned')
      and s.lifted_at is null
      and (s.expires_at is null or s.expires_at > now())
  ) then
    raise exception 'that account already has a live suspension or ban. Lift it first.'
      using errcode = '23505';
  end if;

  insert into public.user_sanctions (user_id, type, scope, reason, expires_at, created_by)
  values (p_user_id, v_type, v_scope, p_reason, p_expires_at, v_actor)
  returning id into v_id;

  if v_type = 'banned' then
    select coalesce(array_agg(s.id), '{}') into v_paused
      from public.mic_series s
     where (s.owner_id = p_user_id
            or (s.owner_id is null and s.created_by = p_user_id))
       and s.is_active
       and s.deleted_at is null;

    if array_length(v_paused, 1) > 0 then
      update public.mic_series set is_active = false where id = any (v_paused);
    end if;

    update public.user_sanctions set paused_series = v_paused where id = v_id;
  end if;

  v_audit := admin.append_audit(
    case v_type
      when 'warned' then 'user.warn'
      when 'suspended' then 'user.suspend'
      else 'user.ban'
    end,
    'user_sanction', v_id,
    null,
    jsonb_build_object(
      'user_id', p_user_id,
      'type', v_type::text,
      'scope', v_scope::text,
      'expires_at', p_expires_at,
      'paused_series', to_jsonb(v_paused)),
    p_reason, p_request_ip);

  update public.user_sanctions set audit_id = v_audit where id = v_id;

  return v_id;
end;
$$;

revoke all on function admin_sanction_apply(uuid, text, text, timestamptz, text, inet)
  from public, anon;
grant execute on function admin_sanction_apply(uuid, text, text, timestamptz, text, inet)
  to authenticated, service_role;
