-- Running the draw closes signups for that night. Owner decision, 2026-08-10.
--
-- Before this, the draw could run while the signup window was still open,
-- and anyone who entered afterwards was pinned to requested forever: no
-- draw ever re-resolved them, no notification fired, and their card read
-- "In the draw" until the night was over. Now the draw is the moment the
-- list becomes the list:
--
-- 1. draw_lottery only runs for a lottery mic on a scheduled night. It was
--    callable on any method and any status; on a first-come night it would
--    have renumbered confirmed rows into a constraint violation at commit.
-- 2. Once a draw has run (any drawn, performed, or no_show row exists), a
--    performer insert is refused with a message that names the reason, so
--    the client can say "the draw has run" instead of "signups are closed".
-- 3. A walk-in the host adds after the draw goes straight onto the list
--    through the same confirm-or-waitlist logic first-come uses, instead of
--    landing in a draw that will never run again as a nameless requested
--    row.
-- 4. signup_counts now reports the entrant count and whether the draw ran,
--    so the signup card can stop advertising "12 of 12 spots left" on a
--    40-entrant lottery and can flip to a closed state after the draw.

create or replace function draw_lottery(p_occurrence_id uuid)
returns setof signups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity smallint;
  v_method public.signup_method;
  v_status public.occurrence_status;
begin
  if not private.owns_occurrence_series(p_occurrence_id) and not private.is_admin() then
    raise exception 'only the producer can draw this lottery' using errcode = '42501';
  end if;

  select s.signup_method, s.capacity, o.status into v_method, v_capacity, v_status
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = p_occurrence_id;

  if v_method is distinct from 'lottery' then
    raise exception 'this mic does not use a draw' using errcode = '23514';
  end if;
  if v_status is distinct from 'scheduled' then
    raise exception 'this night is not on, so there is nothing to draw'
      using errcode = '23514';
  end if;

  -- Performed or no-show both mean the night is underway: somebody has been
  -- called to the microphone by the number this would change.
  if exists (
    select 1 from public.signups sg
    where sg.occurrence_id = p_occurrence_id
      and sg.status in ('performed', 'no_show')
  ) then
    raise exception 'the show has started, so the draw is closed. Reorder the list instead.'
      using errcode = '23514';
  end if;

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
  v_draw_done boolean := false;
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

  if v_method = 'lottery' then
    v_draw_done := exists (
      select 1 from public.signups sg
      where sg.occurrence_id = new.occurrence_id
        and sg.status in ('drawn', 'performed', 'no_show')
    );
    -- The draw is the moment the list becomes the list. The message is a
    -- contract with the client, which shows it instead of the misleading
    -- "signups are not open" it would otherwise guess from the errcode.
    if v_draw_done and new.performer_id is not null then
      raise exception 'The draw for this night has already run, so signups are closed.'
        using errcode = '42501';
    end if;
  end if;

  if v_method in ('first_come', 'reserved_slot')
     or (v_method = 'lottery' and v_draw_done) then
    -- Serialize the count-then-assign section per occurrence. Without this,
    -- two inserts racing for the last spot both see the pre-insert count and
    -- both confirm; the lock makes the second transaction wait until the
    -- first commits, so it counts the winner and waitlists honestly. The
    -- lottery arm of this branch is walk-ins only: the host adding a door
    -- name after the draw puts them straight on the list.
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

-- The card needs to know how crowded a draw is and whether it ran; the shape
-- change forces a drop and recreate.
drop function if exists signup_counts(uuid);
create function signup_counts(p_occurrence_id uuid)
returns table (taken integer, capacity smallint, entrants integer, draw_done boolean)
language sql
security definer
set search_path = ''
stable
as $$
  select
    (select count(*)::int from public.signups sg
     where sg.occurrence_id = p_occurrence_id
       and sg.status in ('confirmed', 'drawn', 'performed')) as taken,
    s.capacity,
    (select count(*)::int from public.signups sg
     where sg.occurrence_id = p_occurrence_id
       and sg.status = 'requested') as entrants,
    (s.signup_method = 'lottery' and exists (
      select 1 from public.signups sg
      where sg.occurrence_id = p_occurrence_id
        and sg.status in ('drawn', 'performed', 'no_show'))) as draw_done
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = p_occurrence_id
    and s.deleted_at is null
    and s.moderation_status = 'approved';
$$;
grant execute on function signup_counts to anon, authenticated;
