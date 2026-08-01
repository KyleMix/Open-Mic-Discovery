-- A lottery cannot be redrawn once the night has started.
--
-- draw_lottery was documented as "re-running redraws only if nothing has been
-- marked performed yet", and nothing in it enforced that. Re-running mid-show
-- reshuffles everyone who has not gone up and numbers them from 1, on top of
-- the positions the people who already performed are still holding:
--
--   slot_position | status
--   --------------+-----------
--               1 | performed
--               1 | drawn
--               2 | drawn
--               2 | performed
--
-- Two performers are each told they are number one, and the running order the
-- host has been calling from stops meaning anything. The draw button sits on
-- the night screen throughout the show, so this is one stray tap away.
--
-- A host who wants to change the order after the night has started has
-- drag-to-reorder and waitlist promotion, both of which preserve everyone
-- else's position. The draw is a one-time act, and it now says so.

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
