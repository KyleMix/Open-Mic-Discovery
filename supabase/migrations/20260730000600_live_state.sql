-- Ending a show is an act, not a timer.
--
-- Live mode closed six hours after the start time, which is a guess at when a
-- mic finishes. A host who runs long lost the controls mid-show, and a host
-- who finished early left them open for hours. The host knows when the night
-- is over, so they say so, and the state lives on the night rather than in
-- whatever device happened to be running it.
--
-- The far backstop stays, at a day, purely so a host who forgets to end the
-- show does not leave last week's list one tap from being rewritten.

alter table mic_occurrences add column live_ended_at timestamptz;

-- ---------------------------------------------------------------------------
-- Ending the show.
--
-- Owner-only and idempotent: a second tap keeps the first time rather than
-- moving the end of the night to whenever someone pressed the button again.
-- Clearing the on-deck flags is part of it. "You are on deck" is a promise
-- that you are about to be called up, and once the show is over it is not
-- true of anybody.
-- ---------------------------------------------------------------------------
create or replace function end_show(p_occurrence_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ended timestamptz;
begin
  if not private.owns_occurrence_series(p_occurrence_id) and not private.is_admin() then
    raise exception 'only the producer can end this show' using errcode = '42501';
  end if;

  update public.mic_occurrences
  set live_ended_at = coalesce(live_ended_at, now())
  where id = p_occurrence_id
  returning live_ended_at into v_ended;

  update public.signups
  set on_deck_at = null
  where occurrence_id = p_occurrence_id and on_deck_at is not null;

  return v_ended;
end;
$$;
grant execute on function end_show to authenticated;

-- Reopening is a plain column write, which the existing owner update policy
-- on mic_occurrences already allows. A host who ends the night by accident
-- while people are still waiting to go up needs a way back in, and it is not
-- worth a second definer function to give them one.
