-- Sanctions: warn, suspend, ban, and make the ban actually bite.
--
-- The gap this closes is F-D from docs/admin/SCHEMA-REPORT.md: nothing in the
-- schema could stop a specific account from using the app. `blocks` is
-- user-to-user and only filters visibility, and content moderation
-- (moderation_status) acts on content rather than on people, so somebody whose
-- listing was rejected could post another one immediately.
--
-- Two separations that the rest of this migration depends on.
--
-- 1. Sanctions act on a person's ability to act. Content moderation acts on
--    content. Suspending someone does not take their listings down, and
--    rejecting a listing does not stop its author posting. They are different
--    levers with different reversals, and conflating them is how a three day
--    suspension quietly kills a weekly mic that fifty performers depend on.
--
--    The one deliberate exception is a ban, which does pause the banned
--    account's listings, because leaving a banned host's mics advertised sends
--    performers to a room whose host is no longer in the product. Section 5
--    below, and it is reversible.
--
-- 2. `reason` on a sanction is written to be read by the person sanctioned.
--    They can select their own rows, they need to know what happened to appeal
--    it, and telling somebody why they are banned is the minimum fairness owed.
--    Anything you would not say to their face goes in the audit row instead,
--    which they never see.
--
-- Down migration: supabase/migrations/down/20260807001400_user_sanctions.down.sql

-- ---------------------------------------------------------------------------
-- 1. Types
--
-- sanction_scope is doing double duty on purpose, as the scope a sanction is
-- issued with and as the capability a check asks about. `all_writes` covers
-- every capability; the narrower three exist because they map to real
-- situations in this product: a performer who is abusive on rosters should stop
-- signing up without losing the room they host, a producer posting junk
-- listings should stop posting without losing their ability to perform, and
-- somebody abusing the report button should stop reporting and nothing else.
--
-- A check always asks about a specific capability, never about `all_writes`.
-- ---------------------------------------------------------------------------
create type sanction_type as enum ('warned', 'suspended', 'banned');
create type sanction_scope as enum ('all_writes', 'signups', 'listings', 'reporting');

-- ---------------------------------------------------------------------------
-- 2. The table
--
-- In `public`, unlike the console's own tables, because the sanctioned person
-- has to be able to read their own row. That means the blanket grants from
-- 20260728001200 apply and have to be revoked back: RLS would deny anyway, but
-- an INSERT grant on a table nobody may insert into is a loaded gun on the
-- table.
--
-- paused_series records exactly which listings a ban switched off, so lifting
-- it restores those and only those. A listing the producer had already paused
-- themselves is not in the array and does not come back on.
-- ---------------------------------------------------------------------------
create table user_sanctions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  type          sanction_type not null,
  scope         sanction_scope not null default 'all_writes',
  reason        text not null check (char_length(btrim(reason)) between 3 and 2000),
  expires_at    timestamptz,
  created_by    uuid not null references profiles (id),
  created_at    timestamptz not null default now(),
  lifted_at     timestamptz,
  lifted_by     uuid references profiles (id),
  lift_reason   text check (char_length(btrim(lift_reason)) between 3 and 2000),
  paused_series uuid[] not null default '{}',
  -- The audit entry this sanction was recorded under. Lifting appends a
  -- reversal that points at it, which is what makes "who lifted it and why"
  -- answerable from the log. No foreign key across into the admin schema: the
  -- log is append only so the row cannot vanish, and public should not need
  -- admin to exist.
  audit_id      bigint,
  check ((lifted_at is null) = (lifted_by is null)),
  check (lifted_at is null or lift_reason is not null),
  -- A warning is a record, not a restriction, so it does not expire. A ban runs
  -- until it is lifted. Only a suspension is time boxed.
  check (case
           when type = 'suspended' then expires_at is not null
           else expires_at is null
         end)
);

create index user_sanctions_user_idx on user_sanctions (user_id)
  where lifted_at is null;
create index user_sanctions_expiry_idx on user_sanctions (expires_at)
  where lifted_at is null and expires_at is not null;

revoke all on user_sanctions from anon;
revoke insert, update, delete, truncate on user_sanctions from authenticated;

alter table user_sanctions enable row level security;

-- The sanctioned person reads their own record, including lifted ones and old
-- warnings. Nothing else about this table is reachable from the API: writes go
-- through the two functions in section 6.
create policy "sanctions subject select" on user_sanctions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

comment on table user_sanctions is
  'Warnings, suspensions and bans. Written only by admin_sanction_apply and '
  'admin_sanction_lift. The reason column is user facing: the sanctioned person '
  'can read their own rows. Private notes belong in admin.audit_log.';

-- ---------------------------------------------------------------------------
-- 3. The predicates
--
-- Three functions, and the split is about query plans as much as clarity.
--
--   is_sanctioned(user, capability)  general form, used in views and RPCs where
--                                    the subject varies per row.
--   i_am_sanctioned(capability)      the caller's own case, so a policy can be
--                                    written as `(select ...)` with no bare
--                                    auth.uid() in it. A bare zero-argument
--                                    call in a policy is evaluated once per row
--                                    (see 20260801000500); wrapped, the planner
--                                    hoists it into an InitPlan and asks once
--                                    per statement.
--   is_banned(user)                  a ban is not a capability check. It is the
--                                    question public_profiles asks.
-- ---------------------------------------------------------------------------
create or replace function private.is_sanctioned(
  p_user_id uuid,
  p_capability sanction_scope
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_sanctions s
    where s.user_id = p_user_id
      and s.type in ('suspended', 'banned')
      and s.lifted_at is null
      and (s.expires_at is null or s.expires_at > now())
      and (s.scope = 'all_writes' or s.scope = p_capability)
  );
$$;

create or replace function private.i_am_sanctioned(p_capability sanction_scope)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select private.is_sanctioned(auth.uid(), p_capability);
$$;

create or replace function private.is_banned(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_sanctions s
    where s.user_id = p_user_id
      and s.type = 'banned'
      and s.lifted_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Where the ban bites
--
-- Every policy below is recreated with its previous text intact and one clause
-- added. The clause is attached to the self-service branch only, never to the
-- admin branch, so a moderator keeps working on rows belonging to a sanctioned
-- person.
--
-- Not changed, with reasons, because a list of what was deliberately left alone
-- is as useful as the list of what moved:
--
--   `profiles owner update`   A banned account is already hidden from
--                             public_profiles, so its bio and stage name are
--                             not publicly visible and editing them harms
--                             nobody. Blocking it would also be one more thing
--                             standing between a banned person and the account
--                             deletion both app stores require.
--   `blocks`, `favorites`,    Private to the person, visible to nobody, and
--   `attendance_log`,         blocking them is punishment without a purpose.
--   `notification_prefs`
--   `signups performer        Withdrawing from a list is always allowed. A
--   withdraw`                 suspended performer who cannot cancel is a
--                             no-show, which is worse for the room.
--   `series_search`           A ban pauses the account's listings (section 5)
--                             and search_discover already filters s.is_active,
--                             so a banned host's mics leave discovery without
--                             touching the search surface.
-- ---------------------------------------------------------------------------

-- Signing up, and saying you are going. Text from 20260728000900 and
-- 20260730000400 respectively.
drop policy "signups performer insert" on signups;
create policy "signups performer insert" on signups
  for insert to authenticated
  with check (
    performer_id = (select auth.uid())
    and not (select private.i_am_sanctioned('signups'))
    and not private.is_blocked_by_producer(occurrence_id, (select auth.uid()))
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_performer and p.deleted_at is null
    )
    and exists (
      select 1 from public.mic_occurrences o
      join public.mic_series s on s.id = o.series_id
      where o.id = occurrence_id
        and o.status = 'scheduled'
        and s.signup_method <> 'host_booked'
        and now() >= o.starts_at - s.signup_opens
        and now() <= o.starts_at - s.signup_closes
    )
  );

drop policy "plans owner insert" on attendance_plans;
create policy "plans owner insert" on attendance_plans
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and not (select private.i_am_sanctioned('signups'))
    and not private.is_blocked_by_producer(occurrence_id, (select auth.uid()))
    and exists (
      select 1 from public.mic_occurrences o
      where o.id = occurrence_id
        and o.status = 'scheduled'
        and o.starts_at > now()
    )
  );

-- Creating and editing places and listings.
drop policy "venues authenticated insert" on venues;
create policy "venues authenticated insert" on venues
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and not (select private.i_am_sanctioned('listings'))
  );

-- The previous "venues creator or admin update" carried an admin branch that
-- duplicated the separate "venues admin update" policy (20260801000500 recreated
-- both). Splitting them here is what lets the sanction clause bind to the
-- creator branch alone: policies OR together, so the admin path is unchanged.
drop policy "venues creator or admin update" on venues;
create policy "venues creator update" on venues
  for update to authenticated
  using (
    created_by = (select auth.uid())
    and not (select private.i_am_sanctioned('listings'))
  );

drop policy "series authenticated insert" on mic_series;
create policy "series authenticated insert" on mic_series
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (owner_id is null or owner_id = (select auth.uid()))
    and not (select private.i_am_sanctioned('listings'))
  );

-- Text from 20260801000500, with the sanction clause inside the ownership
-- branch so `or (select private.is_admin())` still stands alone.
drop policy "series owner update" on mic_series;
create policy "series owner update" on mic_series
  for update to authenticated
  using (
    (
      (
        owner_id = (select auth.uid())
        or (owner_id is null and created_by = (select auth.uid()))
      )
      and not (select private.i_am_sanctioned('listings'))
    )
    or (select private.is_admin())
  )
  with check (
    -- Ownership transfers happen through the claim workflow, not raw update.
    owner_id is null
    or owner_id = (select auth.uid())
    or (select private.is_admin())
  );

-- Credits. Text from 20260801001100.
drop policy "credits manager insert" on public.mic_credits;
create policy "credits manager insert" on public.mic_credits
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and not (select private.i_am_sanctioned('listings'))
    and exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))
    )
  );

drop policy "credits manager update" on public.mic_credits;
create policy "credits manager update" on public.mic_credits
  for update to authenticated
  using (
    (select private.is_admin())
    or (
      not (select private.i_am_sanctioned('listings'))
      and exists (
        select 1 from public.mic_series s
         where s.id = series_id
           and (s.owner_id = (select auth.uid())
                or (s.owner_id is null and s.created_by = (select auth.uid())))
      )
    )
  );

-- Reporting and flagging. Somebody who weaponizes the report queue can be taken
-- out of it without losing anything else.
drop policy "reports reporter insert" on reports;
create policy "reports reporter insert" on reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'open'
    and not (select private.i_am_sanctioned('reporting'))
  );

drop policy "flags authenticated insert" on listing_flags;
create policy "flags authenticated insert" on listing_flags
  for insert to authenticated
  with check (
    flagger_id = (select auth.uid())
    and status = 'open'
    and not (select private.i_am_sanctioned('reporting'))
  );

-- A banned account stops resolving publicly. A suspended one does not: their
-- listings are still running and the roster still has to show who is on it.
-- Column list unchanged from 20260801001000, so this is a genuine replace.
create or replace view public.public_profiles
with (security_invoker = off) as
  select
    p.id,
    p.handle,
    p.stage_name,
    p.avatar_url,
    p.bio,
    p.is_performer,
    p.is_producer,
    p.created_at,
    p.link_instagram,
    p.link_tiktok,
    p.link_youtube,
    p.link_website,
    p.link_spotify,
    p.link_apple_music
  from public.profiles p
  where p.deleted_at is null
    and p.moderation_status = 'approved'
    and not private.is_banned(p.id)
    and (auth.uid() is null or not private.is_blocked_pair(auth.uid(), p.id));

-- ---------------------------------------------------------------------------
-- 5. Authorization for the console
-- ---------------------------------------------------------------------------
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
  -- Where the S8 step-up check goes for sanctions, once MFA is enabled.
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

revoke all on function admin.require_moderator() from public;

-- ---------------------------------------------------------------------------
-- 6. The mutations
-- ---------------------------------------------------------------------------
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

  -- A moderator cannot reach for this to silence the person reviewing them.
  -- Removing an admin is admin_set_active, which is owner only.
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

  -- Two live restrictions on one account would leave nobody able to say which
  -- one is in force. Warnings stack freely, because they restrict nothing.
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

  -- A ban takes the account's listings out of discovery, because a banned host
  -- is not going to be at the room. Exactly which ones is recorded so that
  -- lifting the ban restores those and leaves alone anything the producer had
  -- already paused themselves.
  if v_type = 'banned' then
    -- Collected before the update, not after: "everything of theirs that is
    -- switched off now" would also sweep up listings they had paused
    -- themselves, and lifting the ban would switch those back on.
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

create or replace function admin_sanction_lift(
  p_sanction_id uuid,
  p_reason text,
  p_request_ip inet
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := admin.require_moderator();
  v_s public.user_sanctions%rowtype;
begin
  select * into v_s from public.user_sanctions where id = p_sanction_id;
  if not found then
    raise exception 'no sanction with that id' using errcode = 'P0002';
  end if;
  if v_s.lifted_at is not null then
    raise exception 'that sanction was already lifted on %', v_s.lifted_at
      using errcode = '23505';
  end if;

  update public.user_sanctions
     set lifted_at = now(), lifted_by = v_actor, lift_reason = p_reason
   where id = p_sanction_id;

  -- Put back exactly what the ban switched off.
  if v_s.type = 'banned' and array_length(v_s.paused_series, 1) > 0 then
    update public.mic_series
       set is_active = true
     where id = any (v_s.paused_series)
       and deleted_at is null;
  end if;

  -- The reversal points at the entry that recorded the sanction, so the log
  -- answers "who lifted this and why" without a second table. The one-reversal
  -- index on audit_log means a sanction cannot be lifted twice even if the
  -- check above were somehow bypassed.
  perform admin.append_audit(
    'user.sanction_lift', 'user_sanction', p_sanction_id,
    jsonb_build_object('type', v_s.type::text, 'scope', v_s.scope::text,
                       'expires_at', v_s.expires_at),
    jsonb_build_object('lifted', true),
    p_reason, p_request_ip, v_s.audit_id);
end;
$$;

revoke all on function admin_sanction_apply(uuid, text, text, timestamptz, text, inet)
  from public, anon;
revoke all on function admin_sanction_lift(uuid, text, inet) from public, anon;
grant execute on function admin_sanction_apply(uuid, text, text, timestamptz, text, inet)
  to authenticated, service_role;
grant execute on function admin_sanction_lift(uuid, text, inet)
  to authenticated, service_role;
