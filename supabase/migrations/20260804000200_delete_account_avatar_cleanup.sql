-- Account deletion also removes the user's avatar objects.
--
-- delete_account nulled profiles.avatar_url but left the image itself in
-- the public avatars bucket, where anyone who recorded the URL (or guessed
-- the uid-prefixed path) could fetch it forever. That contradicts the
-- in-app promise that deletion removes personal data immediately, and the
-- privacy disclosures filed with both stores. Deleting the storage.objects
-- row revokes all access through the storage API, which is the only read
-- path for bucket content.
--
-- The function body is otherwise identical to 20260728001400_home_area.sql.

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

  -- The avatar image is personal data; the profile row only held the URL.
  delete from storage.objects
  where bucket_id = 'avatars'
    and (storage.foldername(name))[1] = v_uid::text;

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
