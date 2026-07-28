-- Discovery RPCs: radius search with filters, and text search.
-- SECURITY INVOKER (the default) so row level security applies: anonymous
-- callers see only approved, non-deleted listings, exactly as the table
-- policies dictate. Geometry math stays in the database, never the client.

create or replace function mics_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 40000,
  p_disciplines discipline[] default null,
  p_days integer[] default null,          -- ISO weekday numbers (1 Mon .. 7 Sun)
  p_free_only boolean default false,
  p_methods signup_method[] default null,
  p_start_hour integer default null,      -- local start time window, inclusive
  p_end_hour integer default null,        -- exclusive
  p_limit integer default 100
)
returns table (
  series_id uuid,
  title text,
  disciplines discipline[],
  description text,
  signup_method signup_method,
  cost_cents integer,
  set_length_minutes smallint,
  rrule text,
  start_time time,
  timezone text,
  is_active boolean,
  last_confirmed_at timestamptz,
  venue_id uuid,
  venue_name text,
  neighborhood text,
  city text,
  region text,
  lat double precision,
  lng double precision,
  distance_m double precision,
  next_occurrence_id uuid,
  next_starts_at timestamptz,
  next_local_date date,
  next_status occurrence_status
)
language sql
stable
set search_path = public
as $$
  with ref as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as pt
  )
  select
    s.id,
    s.title,
    s.disciplines,
    s.description,
    s.signup_method,
    s.cost_cents,
    s.set_length_minutes,
    s.rrule,
    s.start_time,
    s.timezone,
    s.is_active,
    s.last_confirmed_at,
    v.id,
    v.name,
    v.neighborhood,
    v.city,
    v.region,
    st_y(v.location::geometry),
    st_x(v.location::geometry),
    st_distance(v.location, ref.pt),
    n.id,
    n.starts_at,
    n.local_date,
    n.status
  from mic_series s
  join venues v on v.id = s.venue_id
  cross join ref
  left join lateral (
    select o.id, o.starts_at, o.local_date, o.status
    from mic_occurrences o
    where o.series_id = s.id
      and o.starts_at >= now()
      and o.status <> 'cancelled'
    order by o.starts_at
    limit 1
  ) n on true
  where st_dwithin(v.location, ref.pt, p_radius_m)
    and (p_disciplines is null or s.disciplines && p_disciplines)
    and (not p_free_only or s.cost_cents = 0)
    and (p_methods is null or s.signup_method = any (p_methods))
    and (p_start_hour is null or extract(hour from s.start_time) >= p_start_hour)
    and (p_end_hour is null or extract(hour from s.start_time) < p_end_hour)
    and (p_days is null or exists (
      select 1 from mic_occurrences o2
      where o2.series_id = s.id
        and o2.starts_at between now() and now() + interval '14 days'
        and o2.status <> 'cancelled'
        and extract(isodow from o2.local_date)::int = any (p_days)
    ))
  order by v.location <-> ref.pt
  limit p_limit;
$$;

create or replace function search_mics(
  p_query text,
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
  city text,
  region text,
  lat double precision,
  lng double precision,
  next_starts_at timestamptz
)
language sql
stable
set search_path = public
as $$
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
    v.city,
    v.region,
    st_y(v.location::geometry),
    st_x(v.location::geometry),
    n.starts_at
  from mic_series s
  join venues v on v.id = s.venue_id
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
    s.title
  limit p_limit;
$$;

grant execute on function mics_near to anon, authenticated;
grant execute on function search_mics to anon, authenticated;
