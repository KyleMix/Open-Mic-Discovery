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
-- The improvement lands in private.delete_account_for, the body shared by
-- the in-app path (delete_account) and the web path (delete_account_web),
-- so both paths keep the identical end state that
-- supabase/tests/deletion.test.sql asserts. The scrub also covers the
-- fields added since the shared body was extracted: stage_name and the
-- Spotify and Apple Music links.

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
      link_spotify = null,
      link_apple_music = null,
      deleted_at = now()
  where id = v_uid;

  -- Removing the auth user ends all sessions and frees the email.
  delete from auth.identities where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;
