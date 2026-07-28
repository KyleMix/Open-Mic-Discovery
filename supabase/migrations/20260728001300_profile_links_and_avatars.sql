-- Profile customization: social links and photo storage.
--
-- Social links live as dedicated columns with strict format checks so the
-- app never has to parse free text into URLs. Handles are stored bare
-- (no @, no domain); full URLs are https only. All four are public through
-- public_profiles, same as bio.
--
-- Avatar images go in a public storage bucket. Each user may only write
-- inside a folder named after their own uid; anyone may read (avatars are
-- public by design, like display names).

alter table profiles
  add column link_instagram text
    check (link_instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column link_tiktok text
    check (link_tiktok ~ '^[A-Za-z0-9._]{1,30}$'),
  add column link_youtube text
    check (link_youtube ~ '^https://' and char_length(link_youtube) <= 200),
  add column link_website text
    check (link_website ~ '^https://' and char_length(link_website) <= 200);

-- create or replace view may only append columns, which is exactly what
-- this does; the security_invoker=off and filter clauses are unchanged.
create or replace view public_profiles
with (security_invoker = off) as
  select
    p.id,
    p.handle,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.home_city,
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

-- Account deletion must scrub the new columns with the rest of the row, so
-- delete_account is redefined with the links added to the profile update.
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

-- Avatar storage. If a hosted project restricts storage DDL from
-- migrations, recreate the bucket and these four policies in the dashboard
-- with identical definitions.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "avatars owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "avatars owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
