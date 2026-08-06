-- Search results render the same card as the rest of discovery.
--
-- search_mics returned a thinner row than mics_near, so typing a city swapped
-- the discovery list for a stripped-down one: no discipline colour, no
-- schedule, no signup method, no cost, no freshness, no poster. Same mics,
-- different format, which reads as a different screen.
--
-- Only the two columns the card needs are added (neighborhood, poster_url).
-- Everything else it draws was already here. The return type changes, so the
-- old signature is dropped first.
--
-- Still SECURITY INVOKER, so row level security continues to hide soft-deleted
-- and unapproved listings exactly as before.

drop function if exists search_mics(text, double precision, double precision, integer);

create function search_mics(
  p_query text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit integer default 50
)
returns table (
  series_id uuid,
  title text,
  disciplines discipline[],
  signup_method signup_method,
  cost_cents integer,
  rrule text,
  start_time time,
  timezone text,
  last_confirmed_at timestamptz,
  venue_id uuid,
  venue_name text,
  neighborhood text,
  city text,
  region text,
  lat double precision,
  lng double precision,
  distance_m double precision,
  next_starts_at timestamptz,
  poster_url text
)
language sql
stable
set search_path = public
as $$
  with ref as (
    select case
      when p_lat is null or p_lng is null then null::geography
      else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    end as pt
  )
  select
    s.id,
    s.title,
    s.disciplines,
    s.signup_method,
    s.cost_cents,
    s.rrule,
    s.start_time,
    s.timezone,
    s.last_confirmed_at,
    v.id,
    v.name,
    v.neighborhood,
    v.city,
    v.region,
    st_y(v.location::geometry),
    st_x(v.location::geometry),
    st_distance(v.location, ref.pt),
    n.starts_at,
    s.poster_url
  from mic_series s
  join venues v on v.id = s.venue_id
  cross join ref
  left join lateral (
    select o.starts_at
    from mic_occurrences o
    where o.series_id = s.id and o.starts_at >= now() and o.status <> 'cancelled'
    order by o.starts_at
    limit 1
  ) n on true
  where s.title ilike '%' || p_query || '%'
     or v.name ilike '%' || p_query || '%'
     or v.city ilike '%' || p_query || '%'
  order by
    (s.title ilike p_query || '%' or v.name ilike p_query || '%' or v.city ilike p_query || '%') desc,
    st_distance(v.location, ref.pt) asc nulls last,
    s.title
  limit p_limit;
$$;

grant execute on function search_mics(text, double precision, double precision, integer)
  to anon, authenticated, service_role;
