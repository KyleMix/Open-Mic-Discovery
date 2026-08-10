-- Undo 20260810001100. Dropping this loses every connection and pending
-- request; socials and attendance data are untouched because the feature
-- only ever pointed at rows that already existed.

drop view if exists connection_nights;
drop view if exists my_connections;

drop trigger if exists connections_notify on connections;
drop function if exists private.queue_connection_notifications();

drop trigger if exists blocks_sever_connections on blocks;
drop function if exists private.sever_connections_on_block();

drop trigger if exists connections_rate_limit on connections;
drop trigger if exists connections_update_guard on connections;
drop function if exists private.guard_connection_update();

drop table if exists connections;
drop function if exists private.profile_is_connectable(uuid);
drop type if exists connection_status;

alter table profiles drop column if exists share_attendance;
alter table notification_prefs drop column if exists network_updates;

-- Restore the kind list from 20260807000100. Queued network rows would fail
-- the restored check, so they go first.
delete from notification_outbox where kind in ('connection_request', 'connection_accepted');
alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in (
    'signup_status', 'favorite_reminder', 'new_mic_nearby', 'weekly_digest',
    'occurrence_cancelled', 'confirm_nudge', 'listing_auto_paused', 'spot_opened',
    'signup_reminder'
  ));

-- Restore the deletion body from 20260804000200 (identical, minus the
-- connections delete).
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

  delete from auth.identities where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;
