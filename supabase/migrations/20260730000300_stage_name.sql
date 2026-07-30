-- Stage name: the name a performer is known by on stage and on the list.
--
-- profiles.display_name was the only name and it was public. Performers
-- generally do not want the name on their bank card on a public roster, so the
-- stage name becomes the public identity and display_name becomes private.
--
-- stage_name is NOT NULL rather than a nullable override with a fallback to
-- display_name. A fallback means "shows the private name whenever the stage
-- name is blank", which is exactly the leak this is meant to prevent.
-- Backfilled from display_name so no existing profile loses a name, and
-- onboarding always writes one.
--
-- After this, display_name appears in no view reachable by anon or
-- authenticated, and the only way to read it is as the row's owner or an
-- admin, which is what the base-table policies already allow.

alter table profiles add column stage_name text;

update profiles set stage_name = display_name where stage_name is null;

alter table profiles
  alter column stage_name set not null,
  add constraint profiles_stage_name_length check (char_length(stage_name) between 1 and 60);

-- ---------------------------------------------------------------------------
-- Public views: stage_name in, display_name out.
--
-- performer_public and producer_public never carried a name (they project the
-- role tables and gate on public_profiles), so they are recreated unchanged
-- purely because the cascade drops them.
-- ---------------------------------------------------------------------------

drop view public_profiles cascade;  -- also drops performer_public, producer_public, signup_roster

create view public_profiles
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
    p.link_website
  from profiles p
  where p.deleted_at is null
    and p.moderation_status = 'approved'
    and (auth.uid() is null or not private.is_blocked_pair(auth.uid(), p.id));

create view performer_public
with (security_invoker = off) as
  select
    pp.profile_id,
    pp.disciplines,
    pp.experience,
    pp.links,
    pp.tags
  from performer_profiles pp
  where exists (select 1 from public_profiles v where v.id = pp.profile_id);

create view producer_public
with (security_invoker = off) as
  select
    pr.profile_id,
    pr.contact_email,
    pr.verified
  from producer_profiles pr
  where exists (select 1 from public_profiles v where v.id = pr.profile_id);

create view signup_roster
with (security_invoker = on) as
  select
    sg.id,
    sg.occurrence_id,
    sg.performer_id,
    sg.status,
    sg.slot_position,
    sg.created_at,
    p.handle,
    p.stage_name,
    sg.on_deck_at
  from signups sg
  left join public_profiles p on p.id = sg.performer_id;

grant select on public_profiles, performer_public, producer_public to anon, authenticated;
grant select on signup_roster to authenticated;

-- ---------------------------------------------------------------------------
-- Moderation: the stage name is public free text, so it goes through the same
-- filter as the display name, bio, and handle. Leaving it out would have made
-- the stage name the one public field nobody screened.
-- ---------------------------------------------------------------------------

create or replace function private.guard_profile_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.is_admin := false;
      new.eula_accepted_at := now();
      new.moderation_status := case
        when private.text_is_clean(new.display_name, new.bio, new.handle::text)
             and private.text_is_clean(new.stage_name, null, null)
        then 'approved' else 'pending' end;
    else
      new.is_admin := old.is_admin;
      if new.moderation_status is distinct from old.moderation_status then
        new.moderation_status := old.moderation_status;
      end if;
      if new.eula_version is distinct from old.eula_version then
        new.eula_accepted_at := now();
      else
        new.eula_accepted_at := old.eula_accepted_at;
      end if;
      if new.display_name is distinct from old.display_name
         or new.stage_name is distinct from old.stage_name
         or new.bio is distinct from old.bio
         or new.handle is distinct from old.handle then
        new.moderation_status := case
          when private.text_is_clean(new.display_name, new.bio, new.handle::text)
               and private.text_is_clean(new.stage_name, null, null)
          then 'approved' else 'pending' end;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion has to scrub the stage name too, or a deleted account keeps
-- its public identity on every roster it appeared on. Both the in-app and the
-- web deletion paths call this one function.
-- ---------------------------------------------------------------------------

create or replace function private.delete_account_for(v_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles where id = v_uid and deleted_at is null
  ) then
    raise exception 'account not found or already deleted' using errcode = 'P0002';
  end if;
  delete from public.favorites where profile_id = v_uid;
  delete from public.attendance_log where profile_id = v_uid;
  delete from public.device_push_tokens where profile_id = v_uid;
  delete from public.notification_prefs where profile_id = v_uid;
  delete from public.blocks where blocker_id = v_uid or blocked_id = v_uid;
  delete from public.performer_profiles where profile_id = v_uid;
  update public.producer_profiles
  set contact_email = null, contact_phone = null, payout_ref = null
  where profile_id = v_uid;

  -- 22 hex chars (88 bits) of the uuid keep the anonymized handle unique
  -- within the 30-char handle limit; short prefixes have collided.
  update public.profiles
  set handle = ('deleted_' || right(replace(v_uid::text, '-', ''), 22))::public.citext,
      display_name = 'Deleted user',
      stage_name = 'Deleted user',
      avatar_url = null,
      bio = null,
      home_city = null,
      home_region = null,
      home_postal_code = null,
      home_lat = null,
      home_lng = null,
      home_location = null,
      birth_year = null,
      link_instagram = null,
      link_tiktok = null,
      link_youtube = null,
      link_website = null,
      deleted_at = now()
  where id = v_uid;

  -- Removing the auth user ends all sessions and frees the email.
  delete from auth.identities where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- The block list snapshots the name at block time so it survives a rename.
-- The blocker sees that snapshot, so it follows the public name.
create or replace function private.snapshot_blocked_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.blocked_display_name := (
    select p.stage_name from public.profiles p where p.id = new.blocked_id
  );
  return new;
end;
$$;
