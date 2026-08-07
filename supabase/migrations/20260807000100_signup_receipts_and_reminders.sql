-- Signup receipts, reminders for people on a list, and waitlist rank.
-- Findings D2, D3, D7 in docs/UX_FINDINGS.md.
--
-- 1. The status push fired only on UPDATE, and a first-come signup is
--    confirmed during INSERT, so the moment the whole app exists for
--    produced no notification at all. The trigger now queues a receipt on
--    insert too: on the list, on the waitlist, or in the draw.
-- 2. Nothing reminded a performer who was actually on a list; the only
--    time-based reminder keyed on favorites. A new hourly job queues a
--    day-before reminder and a show-day nudge for everyone signed up,
--    deduped per signup and phase through the outbox itself.
-- 3. The favorite reminder fired on the first hourly tick after local
--    midnight, which for a 8 PM mic meant roughly 1 AM. It now waits for
--    9 AM in the mic's own timezone.
-- 4. Waitlisted performers saw the bare word "Waitlisted" with no
--    position. my_waitlist_rank() reports the caller's place in line
--    (signup order), which is how hosts are expected to promote.

-- ---------------------------------------------------------------------------
-- 1. A receipt the moment the signup lands.
-- ---------------------------------------------------------------------------
create or replace function private.queue_signup_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_prefs record;
  v_spot  text;
  v_body  text;
begin
  if new.performer_id is null then
    return new;
  end if;
  -- Insert receipts confirm a person's own tap. Seed, service-role, and
  -- test-kit inserts have no one holding a phone waiting for them.
  if tg_op = 'INSERT' and (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    select coalesce(np.signup_updates, true) as enabled into v_prefs
    from public.notification_prefs np where np.profile_id = new.performer_id;
    if not found or v_prefs.enabled then
      select coalesce(o.override_title, s.title) into v_title
      from public.mic_occurrences o
      join public.mic_series s on s.id = o.series_id
      where o.id = new.occurrence_id;
      v_spot := case
        when new.slot_position is not null and new.status in ('confirmed', 'drawn')
        then ' You are number ' || new.slot_position || '.'
        else '' end;
      if tg_op = 'INSERT' then
        v_body := case new.status
          when 'confirmed' then 'You are on the list.'
          when 'waitlisted' then 'You are on the waitlist. If a spot opens, you move up.'
          when 'requested'
            then 'You are in the draw. The host draws before the show; the result comes as a notification either way.'
          else 'You are signed up.'
        end;
      else
        v_body := case new.status
          when 'confirmed' then 'You are on the list.'
          when 'drawn' then 'You were drawn! You are on the list.'
          when 'waitlisted' then 'You are on the waitlist.'
          when 'performed' then 'Marked as performed. Nice set.'
          when 'no_show' then 'You were marked as a no-show.'
          else 'Your signup status changed.'
        end;
      end if;
      insert into public.notification_outbox (profile_id, kind, title, body, payload)
      values (
        new.performer_id,
        'signup_status',
        v_title,
        v_body || v_spot,
        jsonb_build_object(
          'occurrence_id', new.occurrence_id,
          'status', new.status,
          'slot_position', new.slot_position
        )
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger signups_notify on signups;
create trigger signups_notify after insert or update on signups
  for each row execute function private.queue_signup_notification();

-- ---------------------------------------------------------------------------
-- 2. Reminders for people on a list.
-- ---------------------------------------------------------------------------
alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in (
    'signup_status', 'favorite_reminder', 'new_mic_nearby', 'weekly_digest',
    'occurrence_cancelled', 'confirm_nudge', 'listing_auto_paused', 'spot_opened',
    'signup_reminder'
  ));

create or replace function private.queue_signup_reminders()
returns int
language sql
security definer
set search_path = ''
as $$
  with due as (
    select
      sg.id as signup_id,
      sg.performer_id,
      sg.status,
      sg.slot_position,
      o.id as occurrence_id,
      coalesce(o.override_title, s.title) as title,
      o.starts_at,
      s.timezone,
      case
        when o.starts_at between now() + interval '22 hours' and now() + interval '26 hours'
          then 'day_before'
        when o.starts_at between now() + interval '1 hour' and now() + interval '3 hours'
          then 'day_of'
      end as phase
    from public.signups sg
    join public.mic_occurrences o on o.id = sg.occurrence_id and o.status = 'scheduled'
    join public.mic_series s on s.id = o.series_id
      and s.deleted_at is null and s.moderation_status = 'approved'
    left join public.notification_prefs np on np.profile_id = sg.performer_id
    where sg.performer_id is not null
      -- The draw pool gets the show-day nudge only: a day out, the draw has
      -- not happened and "you are on tomorrow" would be a lie.
      and (sg.status in ('confirmed', 'drawn')
           or (sg.status = 'requested'
               and o.starts_at between now() + interval '1 hour' and now() + interval '3 hours'))
      and coalesce(np.signup_updates, true)
  ),
  inserted as (
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select
      d.performer_id,
      'signup_reminder',
      d.title,
      case when d.phase = 'day_before'
        then 'Tomorrow at '
          || trim(to_char(d.starts_at at time zone d.timezone, 'FMHH12:MI PM'))
          || ': you are on the list.'
        else 'Tonight at '
          || trim(to_char(d.starts_at at time zone d.timezone, 'FMHH12:MI PM'))
          || case
               when d.status = 'requested' then '. The host draws the order before the show.'
               else '.'
             end
      end
      || case
           when d.slot_position is not null and d.status in ('confirmed', 'drawn')
           then ' You are number ' || d.slot_position || '.'
           else ''
         end,
      jsonb_build_object(
        'occurrence_id', d.occurrence_id,
        'signup_id', d.signup_id,
        'phase', d.phase
      )
    from due d
    where d.phase is not null
      and not exists (
        select 1 from public.notification_outbox n
        where n.kind = 'signup_reminder'
          and n.payload ->> 'signup_id' = d.signup_id::text
          and n.payload ->> 'phase' = d.phase
      )
    returning 1
  )
  select count(*)::int from inserted;
$$;

-- ---------------------------------------------------------------------------
-- 3. Favorite reminders wait for a civil hour in the mic's own timezone.
-- ---------------------------------------------------------------------------
-- The old zero-argument signature goes away so the clock parameter below is
-- unambiguous (PostgreSQL would otherwise keep both overloads).
drop function private.queue_favorite_reminders();

-- The clock is injectable for tests, exactly like private.rate_limit; the
-- cron job calls it with the default.
create function private.queue_favorite_reminders(p_now timestamptz default now())
returns int
language sql
security definer
set search_path = ''
as $$
  with due as (
    select f.profile_id, o.id as occurrence_id,
           coalesce(o.override_title, s.title) as title, o.starts_at, s.timezone
    from public.favorites f
    join public.mic_series s on s.id = f.series_id
      and s.deleted_at is null and s.moderation_status = 'approved'
    join public.mic_occurrences o on o.series_id = s.id
      and o.status = 'scheduled'
      and o.local_date = (p_now at time zone s.timezone)::date
      and o.starts_at > p_now
    left join public.notification_prefs np on np.profile_id = f.profile_id
    where coalesce(np.favorite_reminders, true)
      -- The hourly job used to queue on its first tick after local
      -- midnight, so "Tonight at 8 PM" arrived at roughly 1 AM.
      and extract(hour from (p_now at time zone s.timezone)) >= 9
  ),
  inserted as (
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select d.profile_id, 'favorite_reminder', d.title,
           'Tonight at '
             || trim(to_char(d.starts_at at time zone d.timezone, 'FMHH12:MI PM'))
             || '. Get on the list.',
           jsonb_build_object('occurrence_id', d.occurrence_id)
    from due d
    where not exists (
      select 1 from public.notification_outbox n
      where n.profile_id = d.profile_id
        and n.kind = 'favorite_reminder'
        and n.payload ->> 'occurrence_id' = d.occurrence_id::text
    )
    returning 1
  )
  select count(*)::int from inserted;
$$;

-- ---------------------------------------------------------------------------
-- 4. Where a waitlisted performer stands.
-- ---------------------------------------------------------------------------
create or replace function my_waitlist_rank(p_occurrence_id uuid)
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select r.rank::int
  from (
    select sg.performer_id, row_number() over (order by sg.created_at) as rank
    from public.signups sg
    where sg.occurrence_id = p_occurrence_id
      and sg.status = 'waitlisted'
  ) r
  where r.performer_id = (select auth.uid());
$$;
grant execute on function my_waitlist_rank to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule the reminder queue. Same guard as every other job: a database
-- without pg_cron applies cleanly and the scheduled-jobs pgTAP test is what
-- makes the silent no-op loud in CI.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.schedule('signup-reminders', '20 * * * *',
    'select private.queue_signup_reminders()');
exception when others then
  raise notice 'pg_cron unavailable, signup-reminders not scheduled: %', sqlerrm;
end;
$$;
