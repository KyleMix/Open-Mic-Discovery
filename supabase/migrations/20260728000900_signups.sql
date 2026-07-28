-- Signups: lifecycle triggers, lottery draw, reordering, realtime, and the
-- notification outbox that push sending consumes.

-- ---------------------------------------------------------------------------
-- Signup lifecycle. On insert the method decides the initial state:
--   first_come / reserved_slot: confirmed in arrival order until capacity,
--     then waitlisted.
--   lottery: requested until the host draws.
-- Fields a performer must never control are pinned on update.
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
create trigger signups_lifecycle before insert or update on signups
  for each row execute function private.signup_lifecycle();

-- The insert policy predates the lifecycle trigger and asserted the initial
-- status itself; WITH CHECK sees the post-trigger row, so those conditions
-- move into the trigger (which the client cannot bypass).
drop policy "signups performer insert" on signups;
create policy "signups performer insert" on signups
  for insert to authenticated
  with check (
    performer_id = (select auth.uid())
    and not private.is_blocked_by_producer(occurrence_id, (select auth.uid()))
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_performer and p.deleted_at is null
    )
    and exists (
      select 1 from public.mic_occurrences o
      join public.mic_series s on s.id = o.series_id
      where o.id = occurrence_id
        and o.status = 'scheduled'
        and s.signup_method <> 'host_booked'
        and now() >= o.starts_at - s.signup_opens
        and now() <= o.starts_at - s.signup_closes
    )
  );

-- ---------------------------------------------------------------------------
-- Lottery draw. Owner-only, server-side randomness, one call assigns every
-- requested name: capacity slots become drawn (positions 1..n in shuffled
-- order), the rest are waitlisted. Re-running redraws only if nothing has
-- been marked performed yet.
-- ---------------------------------------------------------------------------
create or replace function draw_lottery(p_occurrence_id uuid)
returns setof signups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity smallint;
begin
  if not private.owns_occurrence_series(p_occurrence_id) and not private.is_admin() then
    raise exception 'only the producer can draw this lottery' using errcode = '42501';
  end if;
  select s.capacity into v_capacity
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = p_occurrence_id;

  with shuffled as (
    select sg.id, row_number() over (order by random()) as rn
    from public.signups sg
    where sg.occurrence_id = p_occurrence_id
      and sg.status in ('requested', 'drawn', 'waitlisted')
  )
  update public.signups sg
  set status = case
        when sh.rn <= coalesce(v_capacity, 32767) then 'drawn'
        else 'waitlisted'
      end::public.signup_status,
      slot_position = case when sh.rn <= coalesce(v_capacity, 32767) then sh.rn end
  from shuffled sh
  where sg.id = sh.id;

  return query
    select * from public.signups where occurrence_id = p_occurrence_id
    order by slot_position nulls last, created_at;
end;
$$;
grant execute on function draw_lottery to authenticated;

-- Atomic reorder of a night's list. Owner-only; ids not in the array keep
-- their status but lose their position.
create or replace function set_slot_order(p_occurrence_id uuid, p_signup_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.owns_occurrence_series(p_occurrence_id) and not private.is_admin() then
    raise exception 'only the producer can reorder this list' using errcode = '42501';
  end if;
  update public.signups sg
  set slot_position = pos.ordinality
  from unnest(p_signup_ids) with ordinality as pos(id, ordinality)
  where sg.id = pos.id and sg.occurrence_id = p_occurrence_id;
  update public.signups sg
  set slot_position = null
  where sg.occurrence_id = p_occurrence_id
    and sg.id <> all (p_signup_ids);
end;
$$;
grant execute on function set_slot_order to authenticated;

-- Producers read performer display info for their lists through a dedicated
-- view (public_profiles already applies visibility and block rules).
create view signup_roster
with (security_invoker = on) as
  select
    sg.id,
    sg.occurrence_id,
    sg.performer_id,
    sg.status,
    sg.slot_position,
    sg.created_at,
    p.handle,
    p.display_name
  from signups sg
  left join public_profiles p on p.id = sg.performer_id;
grant select on signup_roster to authenticated;

-- ---------------------------------------------------------------------------
-- Notification outbox. Database triggers enqueue; the push-sender Edge
-- Function (or any worker with the service role) delivers and marks sent.
-- ---------------------------------------------------------------------------
create table notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles (id) on delete cascade,
  kind         text not null check (kind in ('signup_status', 'favorite_reminder', 'new_mic_nearby', 'weekly_digest')),
  title        text not null,
  body         text not null,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index notification_outbox_unsent_idx on notification_outbox (created_at) where sent_at is null;
alter table notification_outbox enable row level security;
-- Service-role only; no API policies at all.

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
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
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
create trigger signups_notify after update on signups
  for each row execute function private.queue_signup_notification();

-- Realtime: producers and performers watch a night's list live.
alter publication supabase_realtime add table signups;
