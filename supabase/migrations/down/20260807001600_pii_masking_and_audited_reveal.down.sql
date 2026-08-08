-- Reverses 20260807001600_pii_masking_and_audited_reveal.sql.
--
-- Puts the blanket admin select policies back on profiles and producer_profiles,
-- which means every admin reads contact_email, contact_phone, payout_ref,
-- birth_year, home_city, home_location and display_name again with no reason and
-- no record. Running this reopens the S12 gap.
--
-- The reveal entries already in admin.audit_log stay, because that table is
-- append only. The app's moderation queue reads admin_profile_review after this
-- migration, so reverting the database without reverting the app leaves the
-- held-profile section of that screen empty.

drop function if exists admin_reveal(uuid, text, text, inet);

drop view if exists admin_profile_review;
drop view if exists admin_producer_review;

drop function if exists private.mask_email(text);
drop function if exists private.mask_phone(text);

create policy "profiles admin select" on profiles
  for select to authenticated using ((select private.is_admin_reader()));

create policy "profiles admin update" on profiles
  for update to authenticated using ((select private.is_admin()));

create policy "producer profile admin select" on producer_profiles
  for select to authenticated using ((select private.is_admin()));
