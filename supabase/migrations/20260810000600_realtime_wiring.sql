-- Realtime plumbing the live screens assumed but never had.
--
-- 1. Withdrawals never reached the producer's roster. With the default
--    replica identity a DELETE event carries only the primary key, so the
--    roster subscription's occurrence_id filter could not match and the
--    event was dropped: the host kept calling a name that had left. Full
--    replica identity puts the whole old row in the event so the filter
--    matches. Privacy note: a signups row is an occurrence id, a performer
--    id, a status and a slot number; the roster subscribers who can match
--    the filter are the people who could read the row while it existed.
--
-- 2. mic_series and mic_occurrences were never added to the realtime
--    publication, so a producer cancelling or moving tonight while a
--    performer had the mic page open was invisible until a manual refresh:
--    the mic page's new subscription would have received nothing. Both
--    tables are publicly readable, and subscribers still pass through RLS.
alter table public.signups replica identity full;

alter publication supabase_realtime add table public.mic_series;
alter publication supabase_realtime add table public.mic_occurrences;
