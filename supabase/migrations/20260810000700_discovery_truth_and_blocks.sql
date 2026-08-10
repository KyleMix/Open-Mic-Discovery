-- Three discovery truths in one recreate of search_discover (return shape
-- changes force the drop):
--
-- 1. A cancelled next night is surfaced instead of skipped. Every card
--    rendered the *following* night with no trace the imminent one was
--    called off; the new cancelled_next_starts_at column carries the
--    called-off night so cards can strike the date.
-- 2. Blocking a host now hides their mics from your feed. Settings said
--    "everywhere in the app" and the brief requires blocked users' content
--    filtered from the blocker's queries server side, but only the profile
--    views filtered; discovery did not. Owner gate 2026-08-10: filter.
--    Applied in the enrichment phase, so it costs one indexed probe per
--    returned row, not per candidate.
-- 3. No signature change for the radius: the client stops sending a hard
--    radius bound with a text query (the RPC has documented p_radius_m as
--    nullable since 20260810000200), so an exact-name search for a mic in
--    another city can finally find it, ranked down by distance decay.

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
  host_name text,
  capacity smallint,
  spots_left integer,
  owner_id uuid,
  match_kind text,                 -- 'browse' | 'text' | 'fuzzy'
  rank_score double precision,
  -- The imminent night, when it was called off: the card strikes the date
  -- instead of silently skipping to the following week.
  cancelled_next_starts_at timestamptz
)
language plpgsql
stable
set search_path = public
-- Without this, each session's first five calls plan with the parameter
-- values inlined, and under anonymous RLS that custom plan is
-- catastrophically wrong (measured: 1.4s vs 99ms for the generic plan at
-- 5,020 series). The generic plan is robust here because every optional
-- filter is already written as a null-check OR.
set plan_cache_mode = force_generic_plan
as $$
declare
  -- ---------------------------------------------------------------------
  -- The ranking model, in one place. Components are each 0..1; a weight
  -- is how many points of score a perfect component is worth.
  -- ---------------------------------------------------------------------
  W_TEXT constant double precision := 4.0;   -- what you typed is what you meant
  W_DIST constant double precision := 2.0;   -- closer is better, never disqualifying
  W_TIME constant double precision := 2.5;   -- sooner beats later; tonight beats next week
  W_CONF constant double precision := 1.0;   -- fresh, verified listings edge out stale ones
  -- Component shaping.
  TEXT_FLOOR constant double precision := 0.60;    -- minimum text score of any full text
                                                   -- match; ts_rank_cd spreads the rest
  FUZZY_CEILING constant double precision := 0.50; -- maximum text score of a fuzzy match,
                                                   -- keeping fuzzy strictly below full text
  DIST_HALF_M constant double precision := 15000;  -- distance at which proximity halves (~9 mi)
  TIME_HALF_H constant double precision := 72;     -- hours-until-start at which urgency halves
  START_GRACE constant interval := interval '60 minutes'; -- a just-started mic still counts
  FUZZY_WHEN_UNDER constant integer := 5;    -- run the fuzzy pass when full text found
                                             -- fewer rows than this

  v_qraw text;
  v_tsq tsquery;
  v_pt geography;
  v_text_hits integer := 0;
  -- True when any temporal filter is active: series must then have a
  -- matching night to appear at all.
  v_temporal boolean;
begin
  v_qraw := nullif(trim(private.unaccent_imm(p_query)), '');
  v_pt := case
    when p_lat is null or p_lng is null then null::geography
    else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  end;
  v_temporal := p_days is not null or p_local_from is not null or p_local_to is not null;

  if v_qraw is not null then
    -- The query as a tsquery: every word required, the last as a prefix so
    -- partial typing still matches. Words are reduced to [a-z0-9] runs
    -- first, so the tsquery input needs no escaping.
    select to_tsquery('simple',
             string_agg(w.word || case when w.i = w.cnt then ':*' else '' end,
                        ' & ' order by w.i))
    into v_tsq
    from (
      select t.word, row_number() over () as i, count(*) over () as cnt
      from regexp_split_to_table(lower(v_qraw), '[^a-z0-9]+') as t(word)
      where t.word <> ''
    ) w;
    -- A query of pure punctuation has no words: treat it as browsing.
    if v_tsq is null then
      v_qraw := null;
    else
      select count(*) into v_text_hits from series_search ss where ss.document @@ v_tsq;
    end if;
  end if;

  return query
  with
  -- Text-mode candidates from the GIN indexes. Never scanned in browse
  -- mode (the text arm below is gated off), so it costs nothing there.
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
  -- Phase one: score a narrow tuple per candidate. Each arm drives from
  -- its own index and orders and limits before anything wide is touched.
  ranked as materialized (
    (
      -- Browse arm: candidates by radius (or everything when unbounded).
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
        where v_qraw is null                -- one-time gate: browse mode only
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
      -- Text arm: candidates from the hit list, text relevance leading.
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
        where v_qraw is not null            -- one-time gate: text mode only
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
  -- Phase two: enrich only the surviving rows. The spots count and the
  -- credit lookup run for at most p_limit rows here, never for every
  -- candidate.
  select
    s.id, s.title, s.disciplines, s.description, s.signup_method,
    s.cost_cents, s.set_length_minutes, s.rrule, s.start_time, s.timezone,
    s.is_active, s.last_confirmed_at, s.poster_url,
    v.id, v.name, v.neighborhood, v.city, v.region,
    st_y(v.location::geometry), st_x(v.location::geometry),
    r.r_dist,
    o.id, o.starts_at, o.local_date, o.status,
    coalesce(cr.feat_night, o.featured_name, cr.feat_series),
    coalesce(cr.host_night, cr.host_series),
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
    r.r_score,
    cx.c_starts
  from ranked r
  join mic_series s on s.id = r.r_sid
  join venues v on v.id = s.venue_id
  left join mic_occurrences o on o.id = r.r_nid
  -- Both roles at both levels in one probe. The unique constraint on
  -- (series_id, occurrence_id, role) guarantees at most one row per
  -- min() filter, so min() is selection, not aggregation. The aggregate
  -- always yields exactly one row, so the join never drops a result.
  left join lateral (
    select
      min(c.cname) filter (where c.role = 'host' and c.occurrence_id is not null) as host_night,
      min(c.cname) filter (where c.role = 'host' and c.occurrence_id is null) as host_series,
      min(c.cname) filter (where c.role = 'featured' and c.occurrence_id is not null) as feat_night,
      min(c.cname) filter (where c.role = 'featured' and c.occurrence_id is null) as feat_series
    from (
      select mc.role, mc.occurrence_id,
             coalesce(nullif(trim(mc.name), ''), '@' || mc.handle) as cname
      from mic_credit_public mc
      where mc.series_id = s.id
        and (mc.occurrence_id is null or mc.occurrence_id = o.id)
    ) c
  ) cr on true
  -- A cancelled night earlier than the chosen next: the cancellation is
  -- the news, and hiding it made a called-off Saturday read as still on.
  left join lateral (
    select o2.starts_at as c_starts
    from mic_occurrences o2
    where o2.series_id = s.id
      and o2.status = 'cancelled'
      and o2.starts_at >= now() - START_GRACE
      and (o.starts_at is null or o2.starts_at < o.starts_at)
    order by o2.starts_at
    limit 1
  ) cx on true
  -- Blocking hides that host's mics from your feed, as Settings promises
  -- and the brief requires. Guests skip the check; the pair helper is the
  -- same one the profile views use.
  where s.owner_id is null
     or (select auth.uid()) is null
     or not private.is_blocked_pair((select auth.uid()), s.owner_id)
  order by r.r_score desc, o.starts_at asc nulls last,
           r.r_dist asc nulls last, s.title asc
  limit p_limit;
end;
$$;

grant execute on function search_discover(
  text, double precision, double precision, integer, discipline[], integer[],
  date, date, boolean, signup_method[], age_restriction[], integer, integer, integer
) to anon, authenticated, service_role;
