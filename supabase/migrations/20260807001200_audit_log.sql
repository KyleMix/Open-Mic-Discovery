-- The audit log: append only, one table, reversals point at what they undid.
--
-- Requirement S6 of the moderation console brief, and the owner's decision of
-- 2026-08-07: one audit_log carrying a nullable reverses_id self-reference,
-- rather than the brief's original pair of audit_log plus moderation_actions.
-- A reversal is itself an audited action that points at the action it undid, so
-- "reversed by" and "reversed at" are the reversal row's own actor and
-- timestamp. Two tables would have meant two places that can disagree about
-- what happened.
--
-- Four design decisions worth stating, because each one is load bearing.
--
-- 1. It lives in a new `admin` schema, not in `public`.
--
--    supabase/config.toml exposes `public` and `graphql_public` through the
--    Data API and nothing else, so a table in `admin` is not reachable by any
--    API role at all. That also puts it outside the reach of
--    20260728001200_grants.sql, which runs
--    `alter default privileges in schema public grant all on tables to anon,
--    authenticated, service_role`. In `public` this table would have arrived
--    with UPDATE and DELETE granted to anon, and S6 asks for those grants not
--    to exist rather than merely to be unreachable.
--
-- 2. The actor is the session, never a parameter.
--
--    admin.append_audit() takes no actor argument. It reads auth.uid() and
--    refuses when there is none. The actor's role is derived, not passed:
--    today the database can prove exactly two things about an admin, whether
--    they hold the owner email and whether is_admin is set, which maps onto
--    `owner` and `moderator`. A caller cannot claim to be someone else and
--    cannot claim a role they do not have. This is the same defect class that
--    20260807001100 closed on reports.resolved_by, and an audit log is the
--    last place to reintroduce it.
--
--    Consequence: service-role-only automation cannot write here, because it
--    has no session. That is deliberate. An automated state change is not a
--    moderator action, and private.auto_pause_stale_series() should not appear
--    in a log whose purpose is holding people accountable.
--
-- 3. Nothing may write except admin.append_audit().
--
--    service_role is granted SELECT so the console's audit viewer can read the
--    log, and is granted no INSERT. The only INSERT path is the SECURITY
--    DEFINER function, which is owned by the migration role and so bypasses
--    the missing grant. Every row in this table therefore came through one
--    function, which is what makes the actor and role columns trustworthy
--    rather than merely conventional.
--
-- 4. No foreign keys to profiles, on either actor_id or target_id.
--
--    Same reasoning the reports table gave for its polymorphic target: an audit
--    row has to survive its subject. A foreign key would either block a future
--    hard delete or, worse, cascade into deleting audit rows, and an audit log
--    that can be erased by deleting a row somewhere else is not an audit log.
--    Today profiles are only ever soft-deleted, so nothing is lost by omitting
--    the constraint.
--
-- What this migration does NOT do: wire any existing moderation path to write
-- here. moderate_content, resolve_flag, review_claim and the direct reports
-- update all predate the reason string that S6 requires on every row, and
-- adding a reason parameter changes signatures the mobile app calls. The
-- console's own RPCs will be the first writers. Recording that plainly rather
-- than logging those actions with a null reason, which would put a hole in the
-- one guarantee this table exists to make.
--
-- Down migration: supabase/migrations/down/20260807001200_audit_log.down.sql

-- ---------------------------------------------------------------------------
-- 1. The schema. Reachable by nobody except the service role.
-- ---------------------------------------------------------------------------
create schema if not exists admin;
revoke all on schema admin from public;
grant usage on schema admin to service_role;
-- No usage for anon or authenticated. Without schema usage, every object
-- inside is unreachable regardless of any grant it carries.

comment on schema admin is
  'Moderation console internals. Not exposed through the Data API (see the '
  'api.schemas list in supabase/config.toml) and deliberately outside the '
  'default privileges that 20260728001200 applies to schema public.';

-- ---------------------------------------------------------------------------
-- 2. Role vocabulary
--
-- The three roles the brief fixes. admin_users will use this same type, which
-- is why it is a type and not a check constraint repeated in two places.
-- `read_only` cannot appear in the log today because a read_only admin cannot
-- act, and it is here so that the vocabulary is complete rather than growing
-- by migration later.
-- ---------------------------------------------------------------------------
create type admin.admin_role as enum ('owner', 'moderator', 'read_only');

-- ---------------------------------------------------------------------------
-- 3. The table
-- ---------------------------------------------------------------------------
create table admin.audit_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),

  -- Who. Derived from the session by append_audit, never supplied.
  actor_id      uuid not null,
  actor_role    admin.admin_role not null,

  -- What. `domain.verb`, checked for shape rather than enumerated: the action
  -- vocabulary grows with the console (listing.hide, user.suspend,
  -- email.reveal, admin.invite) and a migration per verb buys nothing when the
  -- column is never used as a predicate on a fixed set.
  action        text not null check (action ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),

  -- To what. Polymorphic and unconstrained, see decision 4 in the header.
  target_type   text not null check (char_length(target_type) between 1 and 40),
  target_id     uuid,

  -- Before and after. Null where the transition has no such side: a creation
  -- has no before, a purge has no after.
  before_state  jsonb,
  after_state   jsonb,

  -- Why. Required, and required to say something: S6 exists so that a decision
  -- can be explained six months later to somebody who was not there.
  reason        text not null check (char_length(btrim(reason)) between 3 and 2000),

  -- Where from. Nullable because Postgres cannot see the client address and
  -- only the console can supply it, so this is a value the caller is trusted
  -- for. append_audit takes it as a required argument with no default, so it
  -- can be passed as null deliberately but never forgotten by accident. Null
  -- is reserved for an action with no HTTP request behind it.
  request_ip    inet,

  -- Reversibility, absorbed from the brief's moderation_actions table.
  -- reversible says whether this action can be undone at all; reverses_id, on
  -- a later row, says that it was.
  reversible    boolean not null default true,
  reverses_id   bigint references admin.audit_log (id)
);

-- One action is undone at most once. A second attempt is a conflict rather
-- than a second history.
create unique index audit_log_one_reversal_per_action
  on admin.audit_log (reverses_id) where reverses_id is not null;

-- No check that reverses_id <> id is needed, and one would be untestable
-- anyway: id is `generated always as identity`, so a caller cannot supply it,
-- and the row does not exist for the foreign key to resolve against while it is
-- being inserted. A row referencing itself is structurally unreachable.

-- The viewer filters by actor, by target, and by date (v1 feature 4).
create index audit_log_occurred_idx on admin.audit_log (occurred_at desc);
create index audit_log_actor_idx on admin.audit_log (actor_id, occurred_at desc);
create index audit_log_target_idx
  on admin.audit_log (target_type, target_id, occurred_at desc);

-- Row level security is redundant here, since no API role has usage on the
-- schema and service_role carries BYPASSRLS in any case. It is enabled with no
-- policies because "every table in this project has RLS enabled" is a rule a
-- reviewer can check at a glance, and a rule with an exception is not one.
-- The controls that actually bind are the grants below and the trigger.
alter table admin.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Grants: read for the console, write for nobody
--
-- Postgres grants EXECUTE on new functions to public by default and nothing on
-- new tables, so the table needs no revoke to be safe from anon. The revoke is
-- here anyway, because S6 is a statement about what grants exist and a reader
-- should not have to know Postgres defaults to verify it.
-- ---------------------------------------------------------------------------
revoke all on admin.audit_log from public;
grant select on admin.audit_log to service_role;
-- Deliberately absent: insert, update, delete, truncate, for every role.

-- ---------------------------------------------------------------------------
-- 5. Append only, enforced by trigger as well as by grants
--
-- The grants stop every role the console can reach. The trigger stops the
-- table owner and any superuser session too, which the grants cannot. Be
-- honest about the limit: a superuser can disable a trigger. Nothing inside one
-- database can defend against its own superuser, which is why S13's key
-- separation and the platform's own audit trail matter alongside this.
-- ---------------------------------------------------------------------------
create or replace function admin.refuse_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'admin.audit_log is append only: % is not permitted. Correct a bad entry '
    'by appending a reversal that points at it.', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_or_delete
  before update or delete on admin.audit_log
  for each row execute function admin.refuse_mutation();

create trigger audit_log_no_truncate
  before truncate on admin.audit_log
  for each statement execute function admin.refuse_mutation();

-- ---------------------------------------------------------------------------
-- 6. The actor's role, derived from what the database can prove today
--
-- Today that is two things: whether the session holds the owner email, and
-- whether is_admin is set. When admin_users and the custom access token hook
-- land, this function reads the allowlist row (or the role claim) instead, and
-- every caller and every stored row keeps working, because the vocabulary does
-- not change. That is the reason the derivation is a function rather than three
-- lines inlined into append_audit.
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
begin
  if v_uid is null then
    raise exception 'an audit entry needs a session: there is no actor here'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from auth.users u
    where u.id = v_uid
      and u.email_confirmed_at is not null
      and private.is_owner_email(u.email)
  ) then
    return 'owner';
  end if;
  if private.is_admin() then
    return 'moderator';
  end if;
  raise exception 'only an admin can be the actor on an audit entry'
    using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The one writer
--
-- Returns the new id so a caller can pass it as p_reverses_id later, and so a
-- console mutation can tie its own response to the row it wrote.
-- ---------------------------------------------------------------------------
create or replace function admin.append_audit(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text,
  p_request_ip inet,
  p_reverses_id bigint default null,
  p_reversible boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role admin.admin_role := admin.actor_role();  -- raises for a non-admin
  v_id bigint;
begin
  if p_reverses_id is not null then
    -- Refusing to record a reversal of something that cannot be reversed is
    -- the point of the reversible column. The foreign key already covers a
    -- reverses_id that names no row.
    if not exists (
      select 1 from admin.audit_log a where a.id = p_reverses_id and a.reversible
    ) then
      raise exception 'audit entry % does not exist or is marked not reversible',
        p_reverses_id using errcode = '23514';
    end if;
  end if;

  insert into admin.audit_log
    (actor_id, actor_role, action, target_type, target_id,
     before_state, after_state, reason, request_ip, reversible, reverses_id)
  values
    (v_actor, v_role, p_action, p_target_type, p_target_id,
     p_before, p_after, p_reason, p_request_ip, p_reversible, p_reverses_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function admin.actor_role() from public;
revoke all on function admin.append_audit(
  text, text, uuid, jsonb, jsonb, text, inet, bigint, boolean
) from public;
-- No grants to anyone. Both are reachable only from another SECURITY DEFINER
-- function owned by the same role, which is how the console's mutations will
-- call them: authorize, act, append, in one transaction.

comment on table admin.audit_log is
  'Append only record of moderator actions. Every row came through '
  'admin.append_audit(), whose actor and role are read from the session rather '
  'than passed in. A reversal is a row whose reverses_id names the action it '
  'undid, so reversed_by and reversed_at are the actor and timestamp of that '
  'reversal row.';
