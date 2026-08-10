-- Three silences around a performer's committed night, closed.
--
-- 1. Deleting or rejecting a listing erased its nights from the Going tab
--    without a word: the signup rows survived, but the invoker-side view
--    join to mic_series returned nothing, so the night just vanished and
--    people still turned up. Those nights are now cancelled properly, which
--    routes through the existing cancellation push. (Pausing is untouched:
--    a paused listing deliberately keeps signed-up nights alive.)
-- 2. Changing a mic's start time re-timed every future night, including
--    ones with signups, and no trigger said so: the show moved and nobody
--    on the list was told. A time change now queues a notice for active
--    signups.
-- 3. The draw's losing branch was worded like a first-come overflow ("You
--    are on the waitlist."), so nobody was ever told the draw happened and
--    their name did not come up.

-- ---------------------------------------------------------------------------
-- 1. A dead listing cancels its committed nights instead of orphaning them.
-- ---------------------------------------------------------------------------
create or replace function private.cancel_orphaned_nights()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.deleted_at is not null and old.deleted_at is null)
     or (new.moderation_status = 'rejected' and old.moderation_status is distinct from 'rejected')
  then
    update public.mic_occurrences o
    set status = 'cancelled',
        cancellation_note = 'The listing was taken down.'
    where o.series_id = new.id
      and o.status = 'scheduled'
      and o.starts_at > now()
      and exists (
        select 1 from public.signups sg
        where sg.occurrence_id = o.id
          and sg.status in ('requested', 'confirmed', 'drawn', 'waitlisted')
      );
  end if;
  return new;
end;
$$;

create trigger mic_series_cancel_orphans after update on mic_series
  for each row execute function private.cancel_orphaned_nights();

-- ---------------------------------------------------------------------------
-- 2. A night that moves tells its list.
-- ---------------------------------------------------------------------------
create or replace function private.queue_time_change_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_when  text;
begin
  if new.status = 'scheduled' and old.status = 'scheduled'
     and new.starts_at is distinct from old.starts_at
  then
    select coalesce(new.override_title, s.title),
           trim(to_char(new.starts_at at time zone s.timezone,
                        'FMDay, FMMon FMDD "at" FMHH12:MI PM'))
      into v_title, v_when
    from public.mic_series s
    where s.id = new.series_id;
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select
      sg.performer_id,
      'signup_status',
      v_title,
      'The start time changed. Your night is now ' || v_when || '.',
      jsonb_build_object('occurrence_id', new.id, 'series_id', new.series_id)
    from public.signups sg
    where sg.occurrence_id = new.id
      and sg.performer_id is not null
      and sg.status in ('requested', 'confirmed', 'drawn', 'waitlisted')
      and not exists (
        select 1 from public.notification_prefs np
        where np.profile_id = sg.performer_id and not np.signup_updates
      );
  end if;
  return new;
end;
$$;

create trigger occurrences_notify_time_change after update on mic_occurrences
  for each row execute function private.queue_time_change_notifications();

-- ---------------------------------------------------------------------------
-- 3. Losing the draw is told as losing the draw.
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
          when 'waitlisted' then
            -- requested -> waitlisted is the draw's losing branch; the
            -- promise at entry was "the result comes either way".
            case when old.status = 'requested'
              then 'The draw ran and your name did not come up. You are on the waitlist: if a spot opens, you move up.'
              else 'You are on the waitlist.'
            end
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
