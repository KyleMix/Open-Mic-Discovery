-- The trust loop: freshness stops being cosmetic.
--   1. Flag spam dedupe: one open flag per person, listing, and reason.
--   2. Admin-confirmed "this mic is dead" flags pause the listing and tell
--      the owner, instead of stamping a row and changing nothing.
--   3. Producers get confirm nudges at 30 and 60 days unconfirmed.
--   4. 90 days unconfirmed after two ignored nudges auto-pauses the listing
--      (one tap resumes it; nothing is deleted).

alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in (
    'signup_status', 'favorite_reminder', 'new_mic_nearby', 'weekly_digest',
    'occurrence_cancelled', 'confirm_nudge', 'listing_auto_paused'
  ));

-- 1. One open flag per (series, flagger, reason). Re-flagging after a
-- resolution stays possible; hammering the button does not.
create unique index listing_flags_open_dedupe
  on listing_flags (series_id, flagger_id, reason)
  where status = 'open';

-- 2. Resolving a flag becomes an action, not a bookkeeping stamp.
create or replace function resolve_flag(p_flag_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag public.listing_flags%rowtype;
  v_series public.mic_series%rowtype;
begin
  if not private.is_admin() then
    raise exception 'only moderators can resolve flags' using errcode = '42501';
  end if;
  select * into v_flag from public.listing_flags where id = p_flag_id;
  if not found then
    raise exception 'flag not found' using errcode = 'P0002';
  end if;

  update public.listing_flags
  set status = case when p_confirm then 'confirmed' else 'dismissed' end::public.flag_status,
      resolved_by = auth.uid(),
      resolved_at = now()
  where id = p_flag_id;

  -- A confirmed dead report pauses the listing so it stops generating
  -- nights and drops out of discovery. The owner can resume any time.
  if p_confirm and v_flag.reason = 'permanently_dead' then
    update public.mic_series
    set is_active = false
    where id = v_flag.series_id and is_active
    returning * into v_series;
    if found and v_series.owner_id is not null then
      insert into public.notification_outbox (profile_id, kind, title, body, payload)
      values (
        v_series.owner_id,
        'listing_auto_paused',
        v_series.title,
        'Paused: a performer reported this mic is no longer running and a '
          || 'moderator confirmed it. If it still runs, resume it from My Mics '
          || 'and confirm the listing.',
        jsonb_build_object('series_id', v_series.id)
      );
    end if;
  end if;
end;
$$;
grant execute on function resolve_flag to authenticated;

-- 3. Confirm nudges. Stage 1 at 30 days unconfirmed, stage 2 at 60. A
-- confirmation resets the cycle because only nudges newer than the last
-- confirmation count.
create or replace function private.queue_confirm_nudges()
returns int
language sql
security definer
set search_path = ''
as $$
  with due as (
    select
      s.id,
      s.title,
      s.owner_id,
      coalesce(s.last_confirmed_at, s.created_at) as anchor,
      case
        when coalesce(s.last_confirmed_at, s.created_at) < now() - interval '60 days' then 2
        else 1
      end as stage
    from public.mic_series s
    where s.owner_id is not null
      and s.is_active
      and s.deleted_at is null
      and s.moderation_status = 'approved'
      and coalesce(s.last_confirmed_at, s.created_at) < now() - interval '30 days'
  ),
  inserted as (
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select
      d.owner_id,
      'confirm_nudge',
      'Is ' || d.title || ' still running?',
      'One tap on My Mics confirms the listing and keeps its freshness badge '
        || 'green for performers.',
      jsonb_build_object('series_id', d.id, 'stage', d.stage)
    from due d
    where not exists (
      select 1 from public.notification_outbox n
      where n.kind = 'confirm_nudge'
        and n.profile_id = d.owner_id
        and n.payload ->> 'series_id' = d.id::text
        and (n.payload ->> 'stage')::int >= d.stage
        and n.created_at > d.anchor
    )
    returning 1
  )
  select count(*)::int from inserted;
$$;

-- 4. Auto-pause: 90 days unconfirmed and both nudges ignored. Pausing stops
-- occurrence generation (existing reconcile trigger) and, with the ranking
-- migration, removes the listing from discovery. Nothing is deleted.
create or replace function private.auto_pause_stale_series()
returns int
language sql
security definer
set search_path = ''
as $$
  with due as (
    select s.id, s.title, s.owner_id
    from public.mic_series s
    where s.owner_id is not null
      and s.is_active
      and s.deleted_at is null
      and coalesce(s.last_confirmed_at, s.created_at) < now() - interval '90 days'
      and (
        select count(distinct n.payload ->> 'stage')
        from public.notification_outbox n
        where n.kind = 'confirm_nudge'
          and n.profile_id = s.owner_id
          and n.payload ->> 'series_id' = s.id::text
          and n.created_at > coalesce(s.last_confirmed_at, s.created_at)
      ) >= 2
  ),
  paused as (
    update public.mic_series s
    set is_active = false
    from due d
    where s.id = d.id
    returning d.id, d.title, d.owner_id
  ),
  notified as (
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select p.owner_id, 'listing_auto_paused', p.title,
      'Paused after 90 days without a confirmation. Resume it any time from '
        || 'My Mics; one tap brings the schedule back.',
      jsonb_build_object('series_id', p.id)
    from paused p
    returning 1
  )
  select count(*)::int from notified;
$$;

do $$
begin
  perform cron.schedule('confirm-nudges', '15 10 * * *',
    'select private.queue_confirm_nudges()');
  perform cron.schedule('auto-pause-stale', '45 10 * * *',
    'select private.auto_pause_stale_series()');
exception when others then
  raise notice 'pg_cron unavailable; schedule the trust loop functions externally';
end $$;
