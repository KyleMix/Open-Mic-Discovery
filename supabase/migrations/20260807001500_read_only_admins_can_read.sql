-- read_only admins can read the queue. They still write nothing.
--
-- The gap this closes is the one 20260807001300 created on purpose and wrote
-- down. profiles.is_admin is a cache of "an active allowlist row whose role is
-- owner or moderator", and around 25 policies read it through
-- private.is_admin(). A read_only admin therefore carried is_admin = false,
-- which is the right answer for every write policy and the wrong answer for
-- every read policy: the one thing the role exists to do is look at the queue.
--
-- The fix is one new predicate and a switch on twelve SELECT policies. Nothing
-- about writing changes: private.is_admin() keeps its meaning and stays on every
-- INSERT, UPDATE and DELETE policy, so read_only remains unable to write
-- anything, and so does every SECURITY DEFINER RPC that checks it
-- (moderate_content, resolve_flag, review_claim, the producer functions, the
-- test kit).
--
-- Why the vocabulary is not being renamed. private.is_admin() would read better
-- as private.can_moderate(), but it is called from around 25 policies, five
-- guard triggers and a dozen RPCs, and renaming it would touch all of them in a
-- migration whose subject is reading. A comment on the function is doing that
-- work instead.
--
-- ---------------------------------------------------------------------------
-- Four SELECT policies deliberately keep private.is_admin(), so read_only
-- cannot see them
-- ---------------------------------------------------------------------------
--
--   test_kit_settings, test_kit_objects
--     The test kit is a development facility, not the queue, and it mints
--     sign-ins with a password written down in a migration. The brief gives
--     read_only "the queue and the audit log", and this is neither.
--
--   banned_terms
--     A settings surface. The brief says a moderator cannot change settings, so
--     a read_only admin certainly does not need to read them. A queue item
--     shows the content that was held; it does not need the word list to be
--     legible.
--
--   producer_profiles
--     contact_phone, contact_email and payout_ref. This is the largest PII
--     surface in the schema and S12 wants it masked with reveals audited.
--     Widening it by a role before that exists would be moving the wrong way.
--
-- ---------------------------------------------------------------------------
-- One thing this does widen, said out loud
-- ---------------------------------------------------------------------------
--
-- `profiles admin select` is switched, which hands a read_only admin
-- birth_year, home_location, home_city and display_name, because row level
-- security cannot hide columns and a held profile cannot be reviewed without
-- reading the row. That is the known S12 gap from the Phase 0 report, now one
-- role wider. The fix does not change: narrow the policy to a column-safe view
-- and put a reason-gated, audited RPC in front of anything private. It is still
-- queued, and this migration makes it slightly more worth doing.
--
-- Down migration:
-- supabase/migrations/down/20260807001500_read_only_admins_can_read.down.sql

-- ---------------------------------------------------------------------------
-- 1. The predicate
--
-- Any active allowlist row, whatever the role. Zero argument and STABLE for the
-- same reason private.is_admin() is: written as `(select ...)` in a policy, the
-- planner hoists it into an InitPlan and asks once per statement instead of once
-- per row (20260801000500).
-- ---------------------------------------------------------------------------
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

comment on function private.is_admin_reader() is
  'True for any active console admin, read_only included. Use on SELECT '
  'policies. For write policies use private.is_admin(), which is owner or '
  'moderator only.';

comment on function private.is_admin() is
  'True for an active owner or moderator, via the profiles.is_admin cache. This '
  'is the WRITE predicate despite the name: read_only admins are excluded on '
  'purpose. For read policies use private.is_admin_reader().';

-- A policy expression is evaluated as the querying role, so the API roles need
-- EXECUTE on anything a policy calls. Postgres grants EXECUTE on new functions
-- to PUBLIC by default, which is what has been carrying this, but the grants in
-- 20260728001200 only ever covered the functions that existed then. Stating them
-- explicitly means a future revoke of the PUBLIC default cannot silently break
-- row level security. private.i_am_sanctioned is here for the same reason.
grant execute on function private.is_admin_reader()
  to anon, authenticated, service_role;
grant execute on function private.i_am_sanctioned(public.sanction_scope)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The twelve SELECT policies
--
-- Each one is recreated with its previous text and one substitution:
-- private.is_admin() becomes private.is_admin_reader(). Nothing else moves.
-- ---------------------------------------------------------------------------

drop policy "profiles admin select" on profiles;
create policy "profiles admin select" on profiles
  for select to authenticated using ((select private.is_admin_reader()));

drop policy "venues admin select" on venues;
create policy "venues admin select" on venues
  for select to authenticated using ((select private.is_admin_reader()));

drop policy "series admin select" on mic_series;
create policy "series admin select" on mic_series
  for select to authenticated using ((select private.is_admin_reader()));

drop policy "credits admin select" on public.mic_credits;
create policy "credits admin select" on public.mic_credits
  for select to authenticated using ((select private.is_admin_reader()));

drop policy "claims requester select" on claim_requests;
create policy "claims requester select" on claim_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or (select private.is_admin_reader()));

drop policy "reports reporter select own" on reports;
create policy "reports reporter select own" on reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin_reader()));

drop policy "flags flagger select own" on listing_flags;
create policy "flags flagger select own" on listing_flags
  for select to authenticated
  using (flagger_id = (select auth.uid()) or (select private.is_admin_reader()));

drop policy "report triage admin select" on report_triage;
create policy "report triage admin select" on report_triage
  for select to authenticated using ((select private.is_admin_reader()));

drop policy "sanctions subject select" on user_sanctions;
create policy "sanctions subject select" on user_sanctions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin_reader()));

drop policy "occurrences stakeholder select" on mic_occurrences;
create policy "occurrences stakeholder select" on mic_occurrences
  for select to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id
      and (s.owner_id = (select auth.uid()) or s.created_by = (select auth.uid()))
  ) or (select private.is_admin_reader()));

drop policy "signups producer select" on signups;
create policy "signups producer select" on signups
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id)
         or (select private.is_admin_reader()));

drop policy "plans producer select" on attendance_plans;
create policy "plans producer select" on attendance_plans
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id)
         or (select private.is_admin_reader()));
