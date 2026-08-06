-- Stop row level security calling is_admin() once per row.
--
-- Measured on 6,704 occurrences with a plain performer signed in: the
-- occurrence read took 85ms, and the plan showed why.
--
--   Seq Scan on mic_occurrences
--     Filter: ((hashed SubPlan 10) OR private.is_admin() OR (hashed SubPlan 16))
--
-- auth.uid() appears in the same policies as an InitPlan, evaluated once,
-- because every one of those calls is written `(select auth.uid())`. The
-- helper functions were not given the same treatment, so is_admin() sat bare
-- in the filter and Postgres called it per row: one SELECT against profiles
-- for every row considered, on every read of every table with an admin
-- policy.
--
-- Wrapping a volatile-looking call in a scalar subquery is what lets the
-- planner hoist it into an InitPlan and run it once per statement. The
-- policies are otherwise recreated exactly as they were, so who can see what
-- does not change: only how many times the question is asked.
--
-- Helpers that take a per-row argument (owns_occurrence_series(occurrence_id),
-- is_blocked_pair(...)) genuinely vary per row and are left alone.


drop policy "profiles admin select" on profiles;
create policy "profiles admin select" on profiles
  for select to authenticated using ((select private.is_admin()));

drop policy "profiles admin update" on profiles;
create policy "profiles admin update" on profiles
  for update to authenticated using ((select private.is_admin()));

drop policy "producer profile admin select" on producer_profiles;
create policy "producer profile admin select" on producer_profiles
  for select to authenticated using ((select private.is_admin()));

drop policy "venues admin select" on venues;
create policy "venues admin select" on venues
  for select to authenticated using ((select private.is_admin()));

drop policy "venues creator or admin update" on venues;
create policy "venues creator or admin update" on venues
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy "series admin select" on mic_series;
create policy "series admin select" on mic_series
  for select to authenticated using ((select private.is_admin()));

drop policy "series owner update" on mic_series;
create policy "series owner update" on mic_series
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (owner_id is null and created_by = (select auth.uid()))
    or (select private.is_admin())
  )
  with check (
    -- Ownership transfers happen through the claim workflow, not raw update.
    owner_id is null
    or owner_id = (select auth.uid())
    or (select private.is_admin())
  );

drop policy "claims requester select" on claim_requests;
create policy "claims requester select" on claim_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or (select private.is_admin()));

drop policy "claims admin update" on claim_requests;
create policy "claims admin update" on claim_requests
  for update to authenticated using ((select private.is_admin()));

drop policy "reports reporter select own" on reports;
create policy "reports reporter select own" on reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

drop policy "reports admin update" on reports;
create policy "reports admin update" on reports
  for update to authenticated using ((select private.is_admin()));

drop policy "flags flagger select own" on listing_flags;
create policy "flags flagger select own" on listing_flags
  for select to authenticated
  using (flagger_id = (select auth.uid()) or (select private.is_admin()));

drop policy "flags admin update" on listing_flags;
create policy "flags admin update" on listing_flags
  for update to authenticated using ((select private.is_admin()));

drop policy "occurrences stakeholder select" on mic_occurrences;
create policy "occurrences stakeholder select" on mic_occurrences
  for select to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id
      and (s.owner_id = (select auth.uid()) or s.created_by = (select auth.uid()))
  ) or (select private.is_admin()));

drop policy "occurrences owner update" on mic_occurrences;
create policy "occurrences owner update" on mic_occurrences
  for update to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id
      and (s.owner_id = (select auth.uid())
           or (s.owner_id is null and s.created_by = (select auth.uid())))
  ) or (select private.is_admin()));

drop policy "signups producer select" on signups;
create policy "signups producer select" on signups
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()));

drop policy "signups producer update" on signups;
create policy "signups producer update" on signups
  for update to authenticated
  using (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()));

drop policy "banned terms admin read" on banned_terms;
create policy "banned terms admin read" on banned_terms
  for select to authenticated using ((select private.is_admin()));

drop policy "banned terms admin write" on banned_terms;
create policy "banned terms admin write" on banned_terms
  for insert to authenticated with check ((select private.is_admin()));

drop policy "banned terms admin delete" on banned_terms;
create policy "banned terms admin delete" on banned_terms
  for delete to authenticated using ((select private.is_admin()));

drop policy "venues admin update" on venues;
create policy "venues admin update" on venues
  for update to authenticated using ((select private.is_admin()));

drop policy "plans producer select" on attendance_plans;
create policy "plans producer select" on attendance_plans
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()));

drop policy "test kit settings admin select" on test_kit_settings;
create policy "test kit settings admin select" on test_kit_settings
  for select to authenticated using ((select private.is_admin()));

drop policy "test kit objects admin select" on test_kit_objects;
create policy "test kit objects admin select" on test_kit_objects
  for select to authenticated using ((select private.is_admin()));
