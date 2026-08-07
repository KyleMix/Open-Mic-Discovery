-- Report triage: severity, assignee, and a resolution note.
--
-- The moderation console's v1 report queue filters by status, target type, age,
-- and severity, sorts oldest first, assigns items, and records what was done.
-- The reports table (20260728000350) already carries reporter, polymorphic
-- target, reason, free text, status, resolver, and timestamps, plus RLS, a rate
-- limit trigger, and pgTAP coverage, so this extends it rather than adding a
-- second queue that could disagree with the first (SCHEMA-REPORT.md, F-E).
--
-- Three pieces, and the split between them is the one design decision here.
--
--   1. severity lands on reports. It is derived from the reason, server side,
--      and it is the sort key the queue needs.
--   2. assigned_to and resolution land on a separate admin-only table,
--      report_triage. They are NOT columns on reports, and that is deliberate:
--      the policy `reports reporter select own` lets a reporter read their own
--      report row, row level security cannot hide columns, and a moderator's
--      internal note is exactly the kind of text that must not come back to
--      the person who filed the report. Same reasoning that put private
--      profile columns behind public_profiles (ARCHITECTURE.md, 2026-07-28).
--   3. resolved_by and resolved_at stop being client supplied.
--
-- On point 3: resolving a report today is a direct table UPDATE from the app
-- (useResolveReport in src/features/safety/queries.ts), which sends its own
-- session id as resolved_by. That happens to be correct and nothing enforces
-- it, so the audit stamp on every resolved report is currently forgeable by any
-- admin. The guard below stamps both columns from auth.uid() and now() on the
-- transition into a resolved state, so the existing client keeps working
-- unchanged and the value stops being a claim. Moving the whole mutation behind
-- a SECURITY DEFINER RPC is still queued (requirement S5); this is the part
-- that costs nothing and closes a forgeable field now.
--
-- Down migration: supabase/migrations/down/20260807001100_report_triage.down.sql

-- ---------------------------------------------------------------------------
-- 1. Severity, derived from the reason
--
-- Declaration order is the sort order, so `order by severity desc` puts urgent
-- first. Reporters do not choose severity: a free choice would be gamed within
-- a week, and the reason enum already carries the signal.
--
-- The mapping is one function so the triage policy lives in exactly one place
-- and changing it is a migration, not a hunt. The else branch means a reason
-- added later lands at normal instead of failing a not-null insert.
-- ---------------------------------------------------------------------------
create type report_severity as enum ('low', 'normal', 'high', 'urgent');

create or replace function private.report_severity_for(p_reason public.report_reason)
returns public.report_severity
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    -- A credible threat of violence is the only thing here that can be an
    -- emergency, and it is the one item worth interrupting a night for.
    when 'violence_threat' then 'urgent'
    -- Harm to a person or a legal exposure. Same day.
    when 'harassment'      then 'high'
    when 'hate'            then 'high'
    when 'sexual_content'  then 'high'
    when 'illegal'         then 'high'
    -- Wrong, and worth acting on, but nobody is unsafe while it waits.
    when 'impersonation'   then 'normal'
    when 'other'           then 'normal'
    when 'spam'            then 'low'
    else 'normal'
  end::public.report_severity;
$$;

alter table reports
  add column severity report_severity not null default 'normal';

-- Existing rows get the same treatment new ones will.
update reports set severity = private.report_severity_for(reason);

-- ---------------------------------------------------------------------------
-- 2. The guard: severity is server derived, resolution stamps are server owned
--
-- Callers with no auth.uid() (service role, migrations, the seed) are left
-- alone, matching every other guard in this schema.
-- ---------------------------------------------------------------------------
create or replace function private.guard_report_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Whatever the client sent for these, the server decides. Severity comes
    -- from the reason; a report cannot arrive pre-resolved. An admin filing a
    -- report gets the same treatment and escalates afterwards, so there is one
    -- rule rather than two.
    new.severity := private.report_severity_for(new.reason);
    new.resolved_by := null;
    new.resolved_at := null;
  else
    -- Only a moderator may re-rank an item. Non-admins have no update policy on
    -- reports at all, so in practice row level security refuses the write
    -- before this runs; the pin is here so the rule holds even if a future
    -- policy opens the verb.
    if not private.is_admin() then
      new.severity := old.severity;
    end if;

    if new.status in ('actioned', 'dismissed')
       and old.status not in ('actioned', 'dismissed') then
      -- The moment of resolution: stamp it from the session, not from the body.
      new.resolved_by := auth.uid();
      new.resolved_at := now();
    elsif new.status not in ('actioned', 'dismissed') then
      -- Reopened. The old stamps described a decision that no longer stands.
      new.resolved_by := null;
      new.resolved_at := null;
    else
      -- Already resolved and still resolved: a later edit does not rewrite who
      -- decided it or when.
      new.resolved_by := old.resolved_by;
      new.resolved_at := old.resolved_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger reports_guard before insert or update on reports
  for each row execute function private.guard_report_writes();

-- ---------------------------------------------------------------------------
-- 3. Indexes the queue actually issues
--
-- reports_queue_idx (status, created_at) already serves oldest first within a
-- status and stays. These three are new:
--
--   severity ordered queue: "open items, worst first, then oldest"
--   assigned queue:         "what is on my plate"
--   target history:         "prior reports against this producer", which v1
--                           listing moderation shows and which no index served
-- ---------------------------------------------------------------------------
create index reports_severity_idx on reports (status, severity desc, created_at);
create index reports_target_idx on reports (target_type, target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. report_triage: the moderator-only side of a report
--
-- One row per report, created when the item is first picked up. Nothing here is
-- ever visible to the reporter, because nothing here is on their row.
--
-- The revokes matter and are not decoration. 20260728001200 runs
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated`, so a table created here arrives with INSERT, UPDATE, DELETE
-- and TRUNCATE granted to anon. Row level security denies anon (it has no
-- policy) but the grant would still be sitting there, and the console's audit
-- log will need the absence of that grant to be a fact rather than a
-- consequence. This is the pattern (SCHEMA-REPORT.md, F-C).
-- ---------------------------------------------------------------------------
create table report_triage (
  report_id    uuid primary key references reports (id) on delete cascade,
  assigned_to  uuid references profiles (id),
  resolution   text check (char_length(resolution) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index report_triage_assigned_idx on report_triage (assigned_to)
  where assigned_to is not null;

create trigger report_triage_updated_at before update on report_triage
  for each row execute function private.set_updated_at();

revoke all on report_triage from anon;
revoke delete, truncate on report_triage from authenticated;

alter table report_triage enable row level security;

create policy "report triage admin select" on report_triage
  for select to authenticated using ((select private.is_admin()));
create policy "report triage admin insert" on report_triage
  for insert to authenticated with check ((select private.is_admin()));
create policy "report triage admin update" on report_triage
  for update to authenticated using ((select private.is_admin()));
-- No delete policy, and the DELETE grant is revoked above: triage history is
-- part of the moderation record. Clearing an assignment is assigned_to = null.

comment on table report_triage is
  'Moderator-only side of a report: who owns it and what was done. Separate '
  'from reports because a reporter can read their own report row and row level '
  'security cannot hide columns.';
comment on column reports.severity is
  'Derived from reason by private.report_severity_for(). Reporters never set '
  'it; a moderator may re-rank an item.';
