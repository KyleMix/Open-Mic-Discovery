-- Unifying the two discovery lines after the merge.
--
-- One line of work gave the discovery RPCs richer cards (poster_url,
-- featured_name, capacity, spots_left) and a center-aware search; the other
-- gave them ranking with teeth (soonest night, then freshness tier, then
-- distance), a server-side paused filter, and the owner_id column for
-- stewardship badges. The migrations between here and the fork each rebuilt
-- the functions from their own line's shape, so whichever ran last dropped
-- the other line's columns. These are the definitive definitions: the union
-- of both.
--
-- Return types change, so both functions are dropped and recreated, then
-- re-granted. Regenerate the Supabase types after applying.

drop function if exists mics_near(
  double precision, double precision, integer, discipline[], integer[],
  boolean, signup_method[], integer, integer, integer
);
drop function if exists search_mics(text, integer);
drop function if exists search_mics(text, double precision, double precision, integer);

create function mics_near(
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
  poster_url text,
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
  next_status occurrence_status,
  featured_name text,
  capacity smallint,
  spots_left integer,
  owner_id uuid
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
    s.poster_url,
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
    n.status,
    n.featured_name,
    s.capacity,
    case
      when s.capacity is null or n.id is null then null
      else greatest(s.capacity - n.taken, 0)
    end,
    s.owner_id
  from mic_series s
  join venues v on v.id = s.venue_id
  cross join ref
  left join lateral (
    select o.id, o.starts_at, o.local_date, o.status, o.featured_name,
           (select count(*)::int from signups sg
             where sg.occurrence_id = o.id
               and sg.status in ('confirmed', 'drawn', 'performed')) as taken
    from mic_occurrences o
    where o.series_id = s.id
      and o.starts_at >= now()
      and o.status <> 'cancelled'
    order by o.starts_at
    limit 1
  ) n on true
  where st_dwithin(v.location, ref.pt, p_radius_m)
    and s.is_active
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
  order by
    (n.local_date is null),
    n.local_date,
    case
      when s.last_confirmed_at is null then 2
      when s.last_confirmed_at > now() - interval '14 days' then 0
      when s.last_confirmed_at > now() - interval '45 days' then 1
      else 2
    end,
    v.location <-> ref.pt
  limit p_limit;
$$;

grant execute on function mics_near(
  double precision, double precision, integer, discipline[], integer[],
  boolean, signup_method[], integer, integer, integer
) to anon, authenticated, service_role;

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
  poster_url text,
  featured_name text,
  capacity smallint,
  spots_left integer,
  owner_id uuid
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
    s.poster_url,
    n.featured_name,
    s.capacity,
    case
      when s.capacity is null or n.starts_at is null then null
      else greatest(s.capacity - n.taken, 0)
    end,
    s.owner_id
  from mic_series s
  join venues v on v.id = s.venue_id
  cross join ref
  left join lateral (
    select o.starts_at, o.featured_name,
           (select count(*)::int from signups sg
             where sg.occurrence_id = o.id
               and sg.status in ('confirmed', 'drawn', 'performed')) as taken
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
