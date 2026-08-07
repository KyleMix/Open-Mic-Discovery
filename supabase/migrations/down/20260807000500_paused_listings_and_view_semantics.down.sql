-- Down migration for 20260807000500_paused_listings_and_view_semantics.sql.
--
-- Restores the three objects exactly as they stood before it: search_mics
-- without the is_active filter (and with the original unparenthesized OR
-- chain), blocked_profiles with no explicit security_invoker option, and
-- private.set_updated_at with no pinned search_path.
--
-- Rolling this back reopens the paused-listing leak in search_mics. It is
-- written out in full anyway, because a down script that quietly declines to
-- undo part of its up is worse than one that undoes all of it and says what
-- that costs.
--
-- Not registered with the Supabase CLI (this directory is outside its glob);
-- apply by hand with psql when rolling back.

create or replace function search_mics(
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

alter view blocked_profiles reset (security_invoker);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
