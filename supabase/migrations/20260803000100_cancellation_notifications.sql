-- Cancellation notifications: cancelling a night tells the people on its
-- list. Before this, the only trace of a cancellation was a red note on the
-- listing that a performer would find by accident.

alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in (
    'signup_status', 'favorite_reminder', 'new_mic_nearby', 'weekly_digest',
    'occurrence_cancelled'
  ));

create or replace function private.queue_cancellation_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_when text;
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    select coalesce(new.override_title, s.title),
           trim(to_char(new.starts_at at time zone s.timezone, 'FMDay, FMMon FMDD'))
      into v_title, v_when
    from public.mic_series s
    where s.id = new.series_id;
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select
      sg.performer_id,
      'occurrence_cancelled',
      v_title,
      v_when || ' is cancelled.'
        || coalesce(' ' || nullif(new.cancellation_note, ''), ''),
      jsonb_build_object('occurrence_id', new.id, 'series_id', new.series_id)
    from public.signups sg
    where sg.occurrence_id = new.id
      -- Guests on the list have no account to notify.
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
create trigger occurrences_notify_cancellation after update on mic_occurrences
  for each row execute function private.queue_cancellation_notifications();
