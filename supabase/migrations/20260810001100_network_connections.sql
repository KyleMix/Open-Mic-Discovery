-- The Network tab: connections between people, made on purpose, ended at will.
--
-- A connection is a mutual yes. One person asks, the other accepts, and only
-- then does either of them see anything: the other's socials (already public
-- on their profile) and which upcoming mics they said they are going to. That
-- attendance is the sensitive part, because it says where a named person will
-- physically be, so three separate controls stand in front of it: the accept
-- itself, a per-account sharing toggle that turns it off without dropping any
-- connection, and the block machinery, which severs the pair entirely.
--
-- Deliberately absent, and load-bearing in their absence: no messaging, no
-- free text anywhere on a connection, no visibility of anyone's network but
-- your own. A declined or withdrawn request is a deleted row, not a state.
-- The owner amended the v1 brief for this feature on 2026-08-10; the brief's
-- reason for excluding a social graph (moderation burden) is answered by
-- there being nothing here to moderate but the request itself, which is rate
-- limited and block-filtered like every other write a stranger can aim at you.

create type connection_status as enum ('pending', 'accepted');

create table connections (
  requester_id  uuid not null references profiles (id) on delete cascade,
  addressee_id  uuid not null references profiles (id) on delete cascade,
  status        connection_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- One live pair, whoever asked first. Without this, A asking B while B asks A
-- would make two rows that accept into two parallel connections.
create unique index connections_pair_uniq
  on connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
-- The badge reads "requests waiting on me" by addressee.
create index connections_addressee_idx on connections (addressee_id, status);

alter table connections enable row level security;

-- ---------------------------------------------------------------------------
-- Whether a profile can be asked at all. SECURITY DEFINER because the base
-- profiles table denies non-owner selects, so a policy subquery run as the
-- caller would see nothing and refuse every request.
-- ---------------------------------------------------------------------------
create function private.profile_is_connectable(p_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_id
      and p.deleted_at is null
      and p.moderation_status = 'approved'
      and not private.is_banned(p.id)
  );
$$;
-- Policies run this as the calling role, and the one-time blanket grant in
-- 20260728001200 predates it.
grant execute on function private.profile_is_connectable(uuid)
  to authenticated, service_role;

create policy "connections party select" on connections
  for select to authenticated
  using (
    (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()))
    -- A block hides the row from both sides even before the sever trigger
    -- lands, so there is no window where a blocked pair still reads as
    -- connected.
    and not private.is_blocked_pair(requester_id, addressee_id)
  );

create policy "connections requester insert" on connections
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and not private.is_blocked_pair(requester_id, addressee_id)
    and private.profile_is_connectable(addressee_id)
  );

-- Accepting is the only update there is. Everything else about a connection
-- is immutable; changing your mind in any direction is a delete.
create policy "connections addressee accept" on connections
  for update to authenticated
  using (
    addressee_id = (select auth.uid())
    and status = 'pending'
    and not private.is_blocked_pair(requester_id, addressee_id)
  )
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

-- Either side ends it, at any stage: the requester withdraws, the addressee
-- declines, or an accepted connection is simply over. No block filter here
-- on purpose, so a row a block has hidden can still be cleaned up by its
-- own parties.
create policy "connections party delete" on connections
  for delete to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

-- The ids and the clock are pinned server side; accepting stamps the time.
create function private.guard_connection_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or private.is_admin() then
    return new;
  end if;
  if new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id
     or new.created_at is distinct from old.created_at then
    raise exception 'a connection cannot be reassigned' using errcode = 'check_violation';
  end if;
  if new.status = 'accepted' and old.status = 'pending' then
    new.responded_at := now();
  end if;
  return new;
end;
$$;
create trigger connections_update_guard
  before update on connections
  for each row execute function private.guard_connection_update();

-- Request spam is the one abuse vector a no-text feature keeps, so it gets
-- the same valve as reports and flags. Twenty asks a day is a working
-- performer meeting a whole showcase; it is not a harassment campaign.
create trigger connections_rate_limit before insert on connections
  for each row execute function private.enforce_rate_limit('connections', '20', '1 day');

-- Blocking someone ends the connection in both directions, pending or
-- accepted. The select policy already hides the pair; this makes the end
-- state true in the data rather than merely presented.
create function private.sever_connections_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.connections
  where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
     or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_sever_connections
  after insert on blocks
  for each row execute function private.sever_connections_on_block();

-- ---------------------------------------------------------------------------
-- The sharing toggle. Default on, because accepting a connection is the
-- consent; turning it off hides every night from every connection at once
-- without dropping anyone. Private column: the base table denies non-owner
-- selects and no view exposes it.
-- ---------------------------------------------------------------------------
alter table profiles
  add column share_attendance boolean not null default true;

-- ---------------------------------------------------------------------------
-- What the tab reads.
--
-- my_connections is SECURITY INVOKER: the connections policies decide which
-- rows exist for the caller, and the join through public_profiles applies
-- the same ban, deletion, and block filtering as everywhere else, so a
-- counterpart who is banned or blocked simply drops out.
-- ---------------------------------------------------------------------------
create view my_connections
with (security_invoker = on) as
  select
    c.requester_id,
    c.addressee_id,
    c.status,
    c.created_at,
    c.responded_at,
    (c.requester_id = (select auth.uid())) as i_requested,
    p.id as other_id,
    p.handle,
    p.stage_name,
    p.avatar_url,
    p.bio,
    p.is_performer,
    p.is_producer,
    p.link_instagram,
    p.link_tiktok,
    p.link_youtube,
    p.link_website,
    p.link_spotify,
    p.link_apple_music
  from connections c
  join public_profiles p
    on p.id = case when c.requester_id = (select auth.uid())
                   then c.addressee_id else c.requester_id end;

-- Where your connections will be. SECURITY DEFINER, because it reads other
-- people's plans and signups, which their own policies rightly refuse to
-- show a stranger; the mates CTE is therefore the access control, and the
-- pgTAP suite asserts a stranger gets zero rows. A yes is a plan or a live
-- signup, upcoming and still scheduled, on a listing the public can see.
create view connection_nights
with (security_invoker = off) as
  with me as (
    select auth.uid() as uid
  ),
  mates as (
    select case when c.requester_id = me.uid then c.addressee_id
                else c.requester_id end as other_id
    from connections c, me
    where me.uid is not null
      and c.status = 'accepted'
      and (c.requester_id = me.uid or c.addressee_id = me.uid)
      and not private.is_blocked_pair(c.requester_id, c.addressee_id)
  ),
  yeses as (
    select ap.profile_id, ap.occurrence_id from attendance_plans ap
    union
    select sg.performer_id, sg.occurrence_id from signups sg
    where sg.performer_id is not null
      and sg.status in ('requested', 'confirmed', 'waitlisted', 'drawn')
  )
  select
    m.other_id,
    pr.handle,
    pr.stage_name,
    pr.avatar_url,
    o.id as occurrence_id,
    o.starts_at,
    o.local_date,
    s.id as series_id,
    s.title,
    s.disciplines,
    s.timezone,
    v.name as venue_name,
    coalesce(v.neighborhood, v.city) as neighborhood
  from mates m
  join profiles pr
    on pr.id = m.other_id
   and pr.deleted_at is null
   and pr.moderation_status = 'approved'
   and pr.share_attendance
   and not private.is_banned(pr.id)
  join yeses y on y.profile_id = m.other_id
  join mic_occurrences o
    on o.id = y.occurrence_id
   and o.status = 'scheduled'
   and o.starts_at >= now()
  join mic_series s
    on s.id = o.series_id
   and s.deleted_at is null
   and s.moderation_status = 'approved'
  left join venues v on v.id = coalesce(o.override_venue_id, s.venue_id);

grant select on my_connections, connection_nights to authenticated;

-- ---------------------------------------------------------------------------
-- A request that nobody hears about is a dead feature: the ask and the
-- answer each push one notification, through the same outbox as everything
-- else, behind a new preference that defaults on and opts out cleanly.
-- ---------------------------------------------------------------------------
alter table notification_prefs
  add column network_updates boolean not null default true;

alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in (
    'signup_status', 'favorite_reminder', 'new_mic_nearby', 'weekly_digest',
    'occurrence_cancelled', 'confirm_nudge', 'listing_auto_paused', 'spot_opened',
    'signup_reminder', 'connection_request', 'connection_accepted'
  ));

create function private.queue_connection_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    select stage_name into v_name from public.profiles where id = new.requester_id;
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select
      new.addressee_id,
      'connection_request',
      'New connection request',
      coalesce(v_name, 'Someone') || ' wants to connect with you.',
      jsonb_build_object('network', true, 'other_id', new.requester_id)
    where not exists (
      select 1 from public.notification_prefs np
      where np.profile_id = new.addressee_id and not np.network_updates
    );
  elsif tg_op = 'UPDATE' and new.status = 'accepted'
        and old.status is distinct from new.status then
    select stage_name into v_name from public.profiles where id = new.addressee_id;
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select
      new.requester_id,
      'connection_accepted',
      'You are connected',
      coalesce(v_name, 'They') || ' accepted your connection request.',
      jsonb_build_object('network', true, 'other_id', new.addressee_id)
    where not exists (
      select 1 from public.notification_prefs np
      where np.profile_id = new.requester_id and not np.network_updates
    );
  end if;
  return new;
end;
$$;
create trigger connections_notify after insert or update on connections
  for each row execute function private.queue_connection_notifications();

-- ---------------------------------------------------------------------------
-- Deleting an account takes its connections with it, in both roles. The FK
-- would cascade on a hard profile delete, but accounts are anonymized in
-- place here, so the rows go explicitly the way blocks already do.
--
-- Also restores the attendance_plans delete: 20260730000400 added it and the
-- 20260804000200 redefinition dropped it by starting from an older body, so
-- a deleted account's plans stayed behind and counted toward headcounts as
-- "Deleted user". Body otherwise identical to 20260804000200.
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
