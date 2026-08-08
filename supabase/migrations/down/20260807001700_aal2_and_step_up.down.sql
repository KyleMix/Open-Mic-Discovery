-- Reverses 20260807001700_aal2_and_step_up.sql.
--
-- Removes the AAL2 requirement from both admin predicates and the step-up check
-- from admin management and sanctions, and drops the switch. After this, an AAL1
-- admin session can read and write everything an admin could before, which is the
-- state S3 exists to prevent.
--
-- If the intent is only to stop enforcing while keeping the machinery, do not run
-- this. Flip the flag instead:
--
--   update admin.security_settings set require_aal2 = false, updated_at = now();

-- Predicates, back to their 20260807001500 and 20260728000200 bodies.
create or replace function private.is_admin_reader()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
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
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function private.is_admin() is
  'True for an active owner or moderator, via the profiles.is_admin cache. This '
  'is the WRITE predicate despite the name: read_only admins are excluded on '
  'purpose. For read policies use private.is_admin_reader().';

-- require_owner without the step-up call (20260807001300 body).
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
  if v_uid is null or not exists (
    select 1 from admin.admin_users a
    where a.user_id = v_uid and a.active and a.role = 'owner'
  ) then
    raise exception 'only an owner can manage admins' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function admin.require_moderator()
returns uuid
language plpgsql
security definer
set search_path = ''
stable
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

-- admin_sanction_apply without the step-up call. Rather than restate its whole
-- body here a second time, the one added statement is removed by replacing the
-- function from the 20260807001400 definition, which is where the canonical text
-- lives. Re-apply that file's function block if this needs to be exact.
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

drop function if exists admin.require_step_up();
drop function if exists admin.has_aal2();
drop function if exists admin.aal2_required();
drop function if exists admin.mfa_verified_at();
drop function if exists admin.session_aal();
drop function if exists admin.mfa_methods();
drop function if exists admin.step_up_window();
drop function if exists private.jwt_claims();

drop table if exists admin.security_settings;
