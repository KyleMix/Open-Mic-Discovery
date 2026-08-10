-- Restores the 20260810001100 body of delete_account_for: share_events
-- attribution is no longer cleared on account deletion.

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
  delete from public.attendance_plans where profile_id = v_uid;
  delete from public.attendance_log where profile_id = v_uid;
  delete from public.device_push_tokens where profile_id = v_uid;
  delete from public.notification_prefs where profile_id = v_uid;
  delete from public.notification_outbox where profile_id = v_uid;
  delete from public.blocks where blocker_id = v_uid or blocked_id = v_uid;
  delete from public.connections where requester_id = v_uid or addressee_id = v_uid;
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
      link_spotify = null,
      link_apple_music = null,
      deleted_at = now()
  where id = v_uid;

  -- Removing the auth user ends all sessions and frees the email.
  delete from auth.identities where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;
