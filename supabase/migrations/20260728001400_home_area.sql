-- Required, private home area on every profile.
--
-- Every profile must carry a home area: city plus state, or a 5-digit ZIP.
-- It exists so discovery can center on where the person actually is, and it
-- is PRIVATE: none of these columns (nor home_city, which used to be
-- public) appear in public_profiles. Only the owner and admins can read
-- them, via the existing base-table policies.
--
-- home_lat/home_lng hold the geocoded point (client geocodes on device; no
-- server geocoding dependency). A trigger mirrors them into the PostGIS
-- home_location column so nearby alerts and retention queries keep
-- working unchanged.

alter table profiles
  add column home_region text
    check (char_length(home_region) between 2 and 40),
  add column home_postal_code text
    check (home_postal_code ~ '^[0-9]{5}$'),
  add column home_lat double precision
    check (home_lat between -90 and 90),
  add column home_lng double precision
    check (home_lng between -180 and 180);

-- City+state or ZIP, always. Deleted profiles are scrubbed instead.
alter table profiles add constraint profiles_home_area_present check (
  deleted_at is not null
  or home_postal_code is not null
  or (home_city is not null and home_region is not null)
);

-- Mirror lat/lng into geography. Only when the pair changed, so server-side
-- writes that set home_location directly are left alone.
create or replace function private.sync_home_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.home_lat is distinct from old.home_lat
     or new.home_lng is distinct from old.home_lng then
    if new.home_lat is not null and new.home_lng is not null then
      new.home_location :=
        public.st_setsrid(public.st_makepoint(new.home_lng, new.home_lat), 4326)::public.geography;
    elsif tg_op = 'UPDATE'
          and (old.home_lat is not null or old.home_lng is not null) then
      new.home_location := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_home_location before insert or update on profiles
  for each row execute function private.sync_home_location();

-- Rebuild the public view WITHOUT home_city: the home area is now private
-- end to end. create or replace cannot drop a column, so the view and its
-- dependents are dropped and recreated verbatim (minus home_city).
drop view public_profiles cascade;  -- also drops performer_public, producer_public, signup_roster

create view public_profiles
with (security_invoker = off) as
  select
    p.id,
    p.handle,
    p.display_name,
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
    p.display_name
  from signups sg
  left join public_profiles p on p.id = sg.performer_id;

grant select on public_profiles, performer_public, producer_public to anon, authenticated;
grant select on signup_roster to authenticated;

-- Account deletion scrubs the new columns too. deleted_at is set in the
-- same statement, which is what satisfies profiles_home_area_present.
create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.favorites where profile_id = v_uid;
  delete from public.attendance_log where profile_id = v_uid;
  delete from public.device_push_tokens where profile_id = v_uid;
  delete from public.notification_prefs where profile_id = v_uid;
  delete from public.notification_outbox where profile_id = v_uid;
  delete from public.blocks where blocker_id = v_uid or blocked_id = v_uid;
  delete from public.performer_profiles where profile_id = v_uid;
  update public.producer_profiles
  set contact_email = null, contact_phone = null, payout_ref = null
  where profile_id = v_uid;

  update public.profiles
  set handle = ('deleted_' || substr(v_uid::text, 1, 8))::public.citext,
      display_name = 'Deleted user',
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
