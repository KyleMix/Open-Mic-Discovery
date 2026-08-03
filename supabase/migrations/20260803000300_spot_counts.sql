-- Anonymous spot counts: performers deciding between two mics need to know
-- whether signing up confirms them or waitlists them. This exposes taken
-- versus capacity for a night, and nothing else: no names, no order.

create or replace function signup_counts(p_occurrence_id uuid)
returns table (taken integer, capacity smallint)
language sql
security definer
set search_path = ''
stable
as $$
  select
    (select count(*)::int from public.signups sg
     where sg.occurrence_id = p_occurrence_id
       and sg.status in ('confirmed', 'drawn', 'performed')) as taken,
    s.capacity
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = p_occurrence_id
    and s.deleted_at is null
    and s.moderation_status = 'approved';
$$;
grant execute on function signup_counts to anon, authenticated;
