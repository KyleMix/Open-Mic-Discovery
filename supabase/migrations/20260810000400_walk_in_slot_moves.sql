-- Reordering a list with a walk-in on it rolled the whole reorder back.
--
-- queue_slot_move_notification fires when a slot number changes and inserts
-- an outbox row for the moved person. Walk-ins have no account, so their
-- rows carry a null performer_id, and notification_outbox.profile_id is not
-- null: the insert raised 23502 and took set_slot_order down with it. The
-- host saw only "Could not reorder the list" and the night's running order
-- was frozen. The sibling trigger queue_signup_notification gained exactly
-- this guard when walk-ins were introduced (20260803000200); this one was
-- missed.
create or replace function private.queue_slot_move_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  -- Walk-ins have no account to notify, and without this guard the insert
  -- below violates the outbox's not-null profile_id and aborts the reorder.
  if new.performer_id is null then
    return new;
  end if;
  if new.slot_position is null
     or new.slot_position is not distinct from old.slot_position
     -- Status changes carry the number themselves; this would double up.
     or new.status is distinct from old.status then
    return new;
  end if;
  if exists (
    select 1 from public.notification_prefs np
    where np.profile_id = new.performer_id and not np.signup_updates
  ) then
    return new;
  end if;
  select coalesce(o.override_title, s.title) into v_title
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = new.occurrence_id;
  insert into public.notification_outbox (profile_id, kind, title, body, payload)
  values (
    new.performer_id,
    'signup_status',
    v_title,
    'The running order changed. You are number ' || new.slot_position || '.',
    jsonb_build_object(
      'occurrence_id', new.occurrence_id,
      'slot_position', new.slot_position
    )
  );
  return new;
end;
$$;
