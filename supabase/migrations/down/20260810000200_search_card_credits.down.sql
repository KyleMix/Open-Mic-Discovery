-- Undo 20260810000200: restore search_discover without the credit lookup,
-- exactly as 20260807000300 defined it. featured_name goes back to reading
-- the occurrence column alone and host_name disappears from the return type.

drop function if exists search_discover(
  text, double precision, double precision, integer, discipline[], integer[],
  date, date, boolean, signup_method[], age_restriction[], integer, integer, integer
);

create function search_discover(
  p_query text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m integer default null,     -- null: no hard bound, decay ranks distance
  p_disciplines discipline[] default null,
  p_days integer[] default null,       -- ISO weekdays (1 Mon .. 7 Sun) the next night must fall on
  p_local_from date default null,      -- venue-local date window, inclusive
  p_local_to date default null,
  p_free_only boolean default false,
  p_methods signup_method[] default null,
  p_ages age_restriction[] default null,
  p_start_hour integer default null,   -- local start time window, inclusive
  p_end_hour integer default null,     -- exclusive
  p_limit integer default 60
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
  owner_id uuid,
  match_kind text,                 -- 'browse' | 'text' | 'fuzzy'
  rank_score double precision
)
language plpgsql
stable
set search_path = public
set plan_cache_mode = force_generic_plan
as $$
declare
  W_TEXT constant double precision := 4.0;
  W_DIST constant double precision := 2.0;
  W_TIME constant double precision := 2.5;
  W_CONF constant double precision := 1.0;
  TEXT_FLOOR constant double precision := 0.60;
  FUZZY_CEILING constant double precision := 0.50;
  DIST_HALF_M constant double precision := 15000;
  TIME_HALF_H constant double precision := 72;
  START_GRACE constant interval := interval '60 minutes';
  FUZZY_WHEN_UNDER constant integer := 5;

  v_qraw text;
  v_tsq tsquery;
  v_pt geography;
  v_text_hits integer := 0;
  v_temporal boolean;
begin
  v_qraw := nullif(trim(private.unaccent_imm(p_query)), '');
  v_pt := case
    when p_lat is null or p_lng is null then null::geography
    else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  end;
  v_temporal := p_days is not null or p_local_from is not null or p_local_to is not null;

  if v_qraw is not null then
    select to_tsquery('simple',
             string_agg(w.word || case when w.i = w.cnt then ':*' else '' end,
                        ' & ' order by w.i))
    into v_tsq
    from (
      select t.word, row_number() over () as i, count(*) over () as cnt
      from regexp_split_to_table(lower(v_qraw), '[^a-z0-9]+') as t(word)
      where t.word <> ''
    ) w;
    if v_tsq is null then
      v_qraw := null;
    else
      select count(*) into v_text_hits from series_search ss where ss.document @@ v_tsq;
    end if;
  end if;

  return query
  with
  hit as materialized (
    select ss.series_id as h_sid,
           true as h_is_text,
           ts_rank_cd(ss.document, v_tsq, 32) as h_text_rank,
           0::real as h_sim
    from series_search ss
    where ss.document @@ v_tsq
    union all
    select f.series_id, false, 0, f.sim
    from private.search_fuzzy_hits(v_qraw) f
    where v_text_hits < FUZZY_WHEN_UNDER
      and not exists (
        select 1 from series_search ss2
        where ss2.series_id = f.series_id and ss2.document @@ v_tsq
      )
  ),
  ranked as materialized (
    (
      select x.r_sid, x.r_nid, x.r_dist, 'browse'::text as r_kind,
             (
               W_DIST * case when x.r_dist is null then 0.5
                             else power(0.5, x.r_dist / DIST_HALF_M) end
               + W_TIME * case when x.r_next is null then 0.0
                               else power(0.5,
                                      greatest(extract(epoch from x.r_next - now()) / 3600.0, 0.0)
                                      / TIME_HALF_H) end
               + W_CONF * x.r_conf
             ) as r_score,
             x.r_next, x.r_title
      from (
        select s.id as r_sid, n.o_id as r_nid, n.o_starts as r_next, s.title as r_title,
               st_distance(v.location, v_pt, false) as r_dist,
               0.7 * case
                 when s.last_confirmed_at > now() - interval '14 days' then 1.0
                 when s.last_confirmed_at > now() - interval '45 days' then 0.5
                 else 0.0
               end
               + 0.3 * case when pp.verified then 1.0 else 0.0 end as r_conf
        from mic_series s
        join venues v on v.id = s.venue_id
        left join producer_profiles pp on pp.profile_id = s.owner_id
        left join lateral (
          select o.id as o_id, o.starts_at as o_starts
          from mic_occurrences o
          where o.series_id = s.id
            and o.status <> 'cancelled'
            and o.starts_at >= now() - START_GRACE
            and (p_local_from is null or o.local_date >= p_local_from)
            and (p_local_to is null or o.local_date <= p_local_to)
            and (p_days is null or extract(isodow from o.local_date)::int = any (p_days))
          order by o.starts_at
          limit 1
        ) n on true
        where v_qraw is null
          and s.is_active
          and (n.o_id is not null or not v_temporal)
          and (p_radius_m is null or v_pt is null
               or st_dwithin(v.location, v_pt, p_radius_m, false))
          and (p_disciplines is null or s.disciplines && p_disciplines)
          and (not p_free_only or s.cost_cents = 0)
          and (p_methods is null or s.signup_method = any (p_methods))
          and (p_ages is null or v.age_restriction = any (p_ages))
          and (p_start_hour is null or extract(hour from s.start_time) >= p_start_hour)
          and (p_end_hour is null or extract(hour from s.start_time) < p_end_hour)
      ) x
      order by 5 desc, x.r_next asc nulls last, x.r_dist asc nulls last, x.r_title asc
      limit p_limit
    )
    union all
    (
      select x.r_sid, x.r_nid, x.r_dist,
             case when x.r_is_text then 'text' else 'fuzzy' end as r_kind,
             (
               W_TEXT * case
                 when x.r_is_text then TEXT_FLOOR + (1.0 - TEXT_FLOOR) * x.r_text_rank
                 else FUZZY_CEILING * x.r_sim
               end
               + W_DIST * case when x.r_dist is null then 0.5
                               else power(0.5, x.r_dist / DIST_HALF_M) end
               + W_TIME * case when x.r_next is null then 0.0
                               else power(0.5,
                                      greatest(extract(epoch from x.r_next - now()) / 3600.0, 0.0)
                                      / TIME_HALF_H) end
               + W_CONF * x.r_conf
             ) as r_score,
             x.r_next, x.r_title
      from (
        select s.id as r_sid, n.o_id as r_nid, n.o_starts as r_next, s.title as r_title,
               h.h_is_text as r_is_text, h.h_text_rank as r_text_rank, h.h_sim as r_sim,
               st_distance(v.location, v_pt, false) as r_dist,
               0.7 * case
                 when s.last_confirmed_at > now() - interval '14 days' then 1.0
                 when s.last_confirmed_at > now() - interval '45 days' then 0.5
                 else 0.0
               end
               + 0.3 * case when pp.verified then 1.0 else 0.0 end as r_conf
        from hit h
        join mic_series s on s.id = h.h_sid
        join venues v on v.id = s.venue_id
        left join producer_profiles pp on pp.profile_id = s.owner_id
        left join lateral (
          select o.id as o_id, o.starts_at as o_starts
          from mic_occurrences o
          where o.series_id = s.id
            and o.status <> 'cancelled'
            and o.starts_at >= now() - START_GRACE
            and (p_local_from is null or o.local_date >= p_local_from)
            and (p_local_to is null or o.local_date <= p_local_to)
            and (p_days is null or extract(isodow from o.local_date)::int = any (p_days))
          order by o.starts_at
          limit 1
        ) n on true
        where v_qraw is not null
          and s.is_active
          and (n.o_id is not null or not v_temporal)
          and (p_radius_m is null or v_pt is null
               or st_dwithin(v.location, v_pt, p_radius_m, false))
          and (p_disciplines is null or s.disciplines && p_disciplines)
          and (not p_free_only or s.cost_cents = 0)
          and (p_methods is null or s.signup_method = any (p_methods))
          and (p_ages is null or v.age_restriction = any (p_ages))
          and (p_start_hour is null or extract(hour from s.start_time) >= p_start_hour)
          and (p_end_hour is null or extract(hour from s.start_time) < p_end_hour)
      ) x
      order by 5 desc, x.r_next asc nulls last, x.r_dist asc nulls last, x.r_title asc
      limit p_limit
    )
  )
  select
    s.id, s.title, s.disciplines, s.description, s.signup_method,
    s.cost_cents, s.set_length_minutes, s.rrule, s.start_time, s.timezone,
    s.is_active, s.last_confirmed_at, s.poster_url,
    v.id, v.name, v.neighborhood, v.city, v.region,
    st_y(v.location::geometry), st_x(v.location::geometry),
    r.r_dist,
    o.id, o.starts_at, o.local_date, o.status, o.featured_name,
    s.capacity,
    case
      when s.capacity is null or o.id is null then null
      else greatest(
        s.capacity - (select count(*)::int from signups sg
                       where sg.occurrence_id = o.id
                         and sg.status in ('confirmed', 'drawn', 'performed')),
        0)
    end,
    s.owner_id,
    r.r_kind,
    r.r_score
  from ranked r
  join mic_series s on s.id = r.r_sid
  join venues v on v.id = s.venue_id
  left join mic_occurrences o on o.id = r.r_nid
  order by r.r_score desc, o.starts_at asc nulls last,
           r.r_dist asc nulls last, s.title asc
  limit p_limit;
end;
$$;

grant execute on function search_discover(
  text, double precision, double precision, integer, discipline[], integer[],
  date, date, boolean, signup_method[], age_restriction[], integer, integer, integer
) to anon, authenticated, service_role;
