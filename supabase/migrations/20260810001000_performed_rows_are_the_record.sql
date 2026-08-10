-- A performer could delete their own performed or no_show row through the
-- API: the withdraw policy had no status guard, so the host's record of who
-- actually played (and who did not show) could be erased by its subject.
-- The UI never offered it; the API allowed it. Withdrawal now covers only
-- the states that are still a reservation, matching what the Withdraw
-- button offers.
alter policy "signups performer withdraw" on public.signups
  using (
    performer_id = (select auth.uid())
    and status in ('requested', 'confirmed', 'waitlisted', 'drawn')
  );
