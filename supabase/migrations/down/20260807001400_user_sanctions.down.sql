-- Reverses 20260807001400_user_sanctions.sql.
--
-- Restores every policy to the text it had before, drops the two RPCs, the three
-- predicates, the table and its types, and takes the banned filter back out of
-- public_profiles.
--
-- Read this before running it. Any listing a ban paused stays paused: the
-- paused_series arrays go with the table, so resuming them afterwards is manual.
-- If sanctions are live, lift them through admin_sanction_lift first and let the
-- RPC put the listings back, then run this.

drop function if exists admin_sanction_apply(uuid, text, text, timestamptz, text, inet);
drop function if exists admin_sanction_lift(uuid, text, inet);
drop function if exists admin.require_moderator();

-- public_profiles without the ban filter (20260801001000 text).
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
    and (auth.uid() is null or not private.is_blocked_pair(auth.uid(), p.id));

-- Policies, back to their pre-sanction text.
drop policy "signups performer insert" on signups;
create policy "signups performer insert" on signups
  for insert to authenticated
  with check (
    performer_id = (select auth.uid())
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
    and not private.is_blocked_by_producer(occurrence_id, (select auth.uid()))
    and exists (
      select 1 from public.mic_occurrences o
      where o.id = occurrence_id
        and o.status = 'scheduled'
        and o.starts_at > now()
    )
  );

drop policy "venues authenticated insert" on venues;
create policy "venues authenticated insert" on venues
  for insert to authenticated with check (created_by = (select auth.uid()));

drop policy "venues creator update" on venues;
create policy "venues creator or admin update" on venues
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy "series authenticated insert" on mic_series;
create policy "series authenticated insert" on mic_series
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (owner_id is null or owner_id = (select auth.uid()))
  );

drop policy "series owner update" on mic_series;
create policy "series owner update" on mic_series
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (owner_id is null and created_by = (select auth.uid()))
    or (select private.is_admin())
  )
  with check (
    owner_id is null
    or owner_id = (select auth.uid())
    or (select private.is_admin())
  );

drop policy "credits manager insert" on public.mic_credits;
create policy "credits manager insert" on public.mic_credits
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
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
    or exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))
    )
  );

drop policy "reports reporter insert" on reports;
create policy "reports reporter insert" on reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');

drop policy "flags authenticated insert" on listing_flags;
create policy "flags authenticated insert" on listing_flags
  for insert to authenticated
  with check (flagger_id = (select auth.uid()) and status = 'open');

drop function if exists private.i_am_sanctioned(public.sanction_scope);
drop function if exists private.is_sanctioned(uuid, public.sanction_scope);
drop function if exists private.is_banned(uuid);

drop table if exists user_sanctions;
drop type if exists sanction_scope;
drop type if exists sanction_type;
