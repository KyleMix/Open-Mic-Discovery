-- Walk-in signups: hosts can put the person standing in front of them on
-- the list without that person having an account. A signup row is now
-- either an account signup (performer_id) or a guest (guest_name), never
-- both. Guest rows are producer-managed and receive no notifications.

alter table signups alter column performer_id drop not null;
alter table signups add column guest_name text
  check (guest_name is null or char_length(guest_name) between 1 and 80);
alter table signups add constraint signups_performer_or_guest
  check ((performer_id is null) <> (guest_name is null));

-- Lifecycle: guests flow through the same capacity and lottery rules as
-- everyone else, and the identity columns stay pinned on update.
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

-- Status pushes must skip guest rows: there is no account behind them.
create or replace function private.queue_signup_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_prefs record;
begin
  if tg_op = 'UPDATE'
     and new.performer_id is not null
     and new.status is distinct from old.status then
    select coalesce(np.signup_updates, true) as enabled into v_prefs
    from public.notification_prefs np where np.profile_id = new.performer_id;
    if not found or v_prefs.enabled then
      select coalesce(o.override_title, s.title) into v_title
      from public.mic_occurrences o
      join public.mic_series s on s.id = o.series_id
      where o.id = new.occurrence_id;
      insert into public.notification_outbox (profile_id, kind, title, body, payload)
      values (
        new.performer_id,
        'signup_status',
        v_title,
        case new.status
          when 'confirmed' then 'You are on the list.'
          when 'drawn' then 'You were drawn! You are on the list.'
          when 'waitlisted' then 'You are on the waitlist.'
          when 'performed' then 'Marked as performed. Nice set.'
          when 'no_show' then 'You were marked as a no-show.'
          else 'Your signup status changed.'
        end,
        jsonb_build_object('occurrence_id', new.occurrence_id, 'status', new.status)
      );
    end if;
  end if;
  return new;
end;
$$;

-- On deck: same guard. The roster flag still flips for a guest; only the
-- push is skipped.
create or replace function mark_on_deck(p_signup_id uuid, p_on_deck boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signup public.signups%rowtype;
begin
  select * into v_signup from public.signups where id = p_signup_id;
  if not found then
    raise exception 'signup not found' using errcode = 'P0002';
  end if;
  if not (private.owns_occurrence_series(v_signup.occurrence_id) or private.is_admin()) then
    raise exception 'only the producer of this mic can set on deck' using errcode = '42501';
  end if;
  if p_on_deck and v_signup.status not in ('confirmed', 'drawn') then
    raise exception 'only performers on the list can be on deck' using errcode = '23514';
  end if;

  update public.signups
  set on_deck_at = case when p_on_deck then now() else null end
  where id = p_signup_id;

  -- Notify once per flagging, unless the performer opted out of signup
  -- updates (a missing prefs row counts as opted in, matching retention).
  if p_on_deck and v_signup.on_deck_at is null and v_signup.performer_id is not null then
    insert into public.notification_outbox (profile_id, kind, title, body, payload)
    select v_signup.performer_id, 'signup_status',
           'You are on deck',
           'Get ready: you are up soon at ' || coalesce(o.override_title, s.title) || '.',
           jsonb_build_object('occurrence_id', v_signup.occurrence_id, 'on_deck', true)
    from public.mic_occurrences o
    join public.mic_series s on s.id = o.series_id
    where o.id = v_signup.occurrence_id
      and not exists (
        select 1 from public.notification_prefs np
        where np.profile_id = v_signup.performer_id and not np.signup_updates
      );
  end if;
end;
$$;

-- Producers manage guest rows on their own occurrences: add and remove.
-- The existing producer update policy already covers status changes.
create policy "signups producer guest insert" on signups
  for insert to authenticated
  with check (
    guest_name is not null
    and performer_id is null
    and (private.owns_occurrence_series(occurrence_id) or private.is_admin())
    and exists (
      select 1 from public.mic_occurrences o
      where o.id = occurrence_id and o.status = 'scheduled'
    )
  );
create policy "signups producer guest delete" on signups
  for delete to authenticated
  using (
    guest_name is not null
    and (private.owns_occurrence_series(occurrence_id) or private.is_admin())
  );

-- Roster view: guests appear by their given name.
create or replace view signup_roster
with (security_invoker = on) as
  select
    sg.id,
    sg.occurrence_id,
    sg.performer_id,
    sg.status,
    sg.slot_position,
    sg.created_at,
    p.handle,
    p.display_name,
    sg.on_deck_at,
    sg.guest_name
  from signups sg
  left join public_profiles p on p.id = sg.performer_id;
