-- Signup capacity race, promotion slots, and freed-spot notification.
-- Findings C5, C7, C8 in docs/UX_FINDINGS.md.
--
-- 1. The lifecycle trigger checked capacity with a plain count under read
--    committed: two people tapping the last slot at once both counted the
--    pre-insert rows, both confirmed, and max(slot_position) + 1 could hand
--    both the same slot number. A per-occurrence advisory transaction lock
--    now serializes the check-then-assign section, so the second insert
--    waits, sees the first, and lands on the waitlist honestly.
-- 2. A deferrable unique constraint on (occurrence_id, slot_position) makes
--    duplicate slot numbers impossible at commit, whatever path produced
--    them. Deferred because set_slot_order rewrites positions in two
--    statements and only the final state has to be unique. Waitlisted rows
--    carry null positions, which never collide.
-- 3. Promotion off the waitlist assigned no slot: the position logic ran on
--    insert only, so a promoted performer read "On the list" with no number
--    until the host manually reordered. The update branch now assigns the
--    next slot under the same lock.
-- 4. A withdrawal that frees a list spot did nothing: no trigger existed on
--    delete, so the waitlist promise ("the host promotes people") depended
--    on the host staring at the roster. The producer now gets a push when a
--    confirmed or drawn performer withdraws while people are waiting.
--    Owner decision recorded in docs/UX_FINDINGS.md (C7): notify the host,
--    who keeps control of promotion, rather than auto-promote.

-- ---------------------------------------------------------------------------
-- 2. No two signups on one night can hold the same slot number.
-- ---------------------------------------------------------------------------
alter table signups add constraint signups_slot_position_unique
  unique (occurrence_id, slot_position) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- 1 + 3. Race-safe lifecycle: capacity check and slot assignment serialize
-- per occurrence; waitlist promotion gets the next slot immediately.
-- ---------------------------------------------------------------------------
create or replace function private.signup_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method public.signup_method;
  v_capacity smallint;
  v_taken int;
begin
  if tg_op = 'UPDATE' then
    new.occurrence_id := old.occurrence_id;
    new.performer_id := old.performer_id;
    new.guest_name := old.guest_name;
    new.created_at := old.created_at;
    -- Promotion off the waitlist gets the next slot number the moment the
    -- host confirms it, instead of "On the list" with no number until a
    -- manual reorder. Undo flows (performed back to confirmed) keep the
    -- slot they already hold and skip this.
    if old.status = 'waitlisted' and new.status = 'confirmed' and new.slot_position is null then
      perform pg_advisory_xact_lock(hashtextextended('signups:' || new.occurrence_id::text, 0));
      new.slot_position := coalesce(
        (select max(sg.slot_position) from public.signups sg
         where sg.occurrence_id = new.occurrence_id), 0) + 1;
    end if;
    return new;
  end if;

  -- The client never chooses its own starting state.
  new.status := 'requested';
  new.slot_position := null;

  select s.signup_method, s.capacity into v_method, v_capacity
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = new.occurrence_id;

  if v_method in ('first_come', 'reserved_slot') then
    -- Serialize the count-then-assign section per occurrence. Without this,
    -- two inserts racing for the last spot both see the pre-insert count and
    -- both confirm; the lock makes the second transaction wait until the
    -- first commits, so it counts the winner and waitlists honestly.
    perform pg_advisory_xact_lock(hashtextextended('signups:' || new.occurrence_id::text, 0));
    select count(*) into v_taken
    from public.signups sg
    where sg.occurrence_id = new.occurrence_id
      and sg.status in ('confirmed', 'drawn', 'performed');
    if v_capacity is null or v_taken < v_capacity then
      new.status := 'confirmed';
      new.slot_position := coalesce(
        (select max(sg.slot_position) from public.signups sg
         where sg.occurrence_id = new.occurrence_id), 0) + 1;
    else
      new.status := 'waitlisted';
      new.slot_position := null;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tell the host when a list spot frees up with people waiting.
-- ---------------------------------------------------------------------------
alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in (
    'signup_status', 'favorite_reminder', 'new_mic_nearby', 'weekly_digest',
    'occurrence_cancelled', 'confirm_nudge', 'listing_auto_paused', 'spot_opened'
  ));

create or replace function private.notify_spot_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text;
  v_starts timestamptz;
  v_waiting int;
begin
  -- Only a lost list spot matters; a withdrawn waitlist or draw entry
  -- frees nothing.
  if old.status not in ('confirmed', 'drawn') then
    return old;
  end if;
  select s.owner_id, coalesce(o.override_title, s.title), o.starts_at
    into v_owner, v_title, v_starts
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = old.occurrence_id;
  -- Skip when there is no owner to tell, the night is already done (the
  -- twelve hour reach matches how long a running show stays manageable),
  -- the owner removed the row themselves (they are looking at the roster),
  -- or a system path (service role) is cleaning up.
  if v_owner is null
     or v_starts is null
     or v_starts < now() - interval '12 hours'
     or (select auth.uid()) is null
     or v_owner = (select auth.uid()) then
    return old;
  end if;
  select count(*)::int into v_waiting
  from public.signups sg
  where sg.occurrence_id = old.occurrence_id
    and sg.status = 'waitlisted';
  if v_waiting = 0 then
    return old;
  end if;
  insert into public.notification_outbox (profile_id, kind, title, body, payload)
  values (
    v_owner,
    'spot_opened',
    v_title,
    'A spot opened: someone withdrew from the list. '
      || v_waiting
      || case when v_waiting = 1 then ' person is' else ' people are' end
      || ' on the waitlist.',
    jsonb_build_object('occurrence_id', old.occurrence_id)
  );
  return old;
end;
$$;

create trigger signups_notify_spot_opened after delete on signups
  for each row execute function private.notify_spot_opened();
