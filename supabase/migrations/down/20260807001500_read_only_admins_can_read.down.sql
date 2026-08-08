-- Reverses 20260807001500_read_only_admins_can_read.sql.
--
-- Puts private.is_admin() back on all twelve SELECT policies, which means a
-- read_only admin can read nothing again. Their allowlist rows survive, so they
-- keep console access with no visibility, which is a worse state than either
-- side of this migration. If read_only admins exist, deactivate them with
-- admin_set_active before running this.

drop policy "profiles admin select" on profiles;
create policy "profiles admin select" on profiles
  for select to authenticated using ((select private.is_admin()));

drop policy "venues admin select" on venues;
create policy "venues admin select" on venues
  for select to authenticated using ((select private.is_admin()));

drop policy "series admin select" on mic_series;
create policy "series admin select" on mic_series
  for select to authenticated using ((select private.is_admin()));

drop policy "credits admin select" on public.mic_credits;
create policy "credits admin select" on public.mic_credits
  for select to authenticated using ((select private.is_admin()));

drop policy "claims requester select" on claim_requests;
create policy "claims requester select" on claim_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or (select private.is_admin()));

drop policy "reports reporter select own" on reports;
create policy "reports reporter select own" on reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

drop policy "flags flagger select own" on listing_flags;
create policy "flags flagger select own" on listing_flags
  for select to authenticated
  using (flagger_id = (select auth.uid()) or (select private.is_admin()));

drop policy "report triage admin select" on report_triage;
create policy "report triage admin select" on report_triage
  for select to authenticated using ((select private.is_admin()));

drop policy "sanctions subject select" on user_sanctions;
create policy "sanctions subject select" on user_sanctions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy "occurrences stakeholder select" on mic_occurrences;
create policy "occurrences stakeholder select" on mic_occurrences
  for select to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id
      and (s.owner_id = (select auth.uid()) or s.created_by = (select auth.uid()))
  ) or (select private.is_admin()));

drop policy "signups producer select" on signups;
create policy "signups producer select" on signups
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()));

drop policy "plans producer select" on attendance_plans;
create policy "plans producer select" on attendance_plans
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()));

comment on function private.is_admin() is null;
drop function if exists private.is_admin_reader();
