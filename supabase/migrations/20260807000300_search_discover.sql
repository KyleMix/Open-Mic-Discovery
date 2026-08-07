-- search_discover: one query path for browsing and searching.
--
-- The Discover screen previously split into two RPCs with different rules:
-- mics_near (filters, radius, no text) and search_mics (text, no filters,
-- no radius, and it leaked paused listings). Typing silently abandoned
-- every filter chip. This function serves both states: with no query text
-- it is the ranked nearby feed; with text it is the same feed narrowed.
-- Both existing RPCs are left untouched; no caller breaks.
--
-- Matching (text mode):
--   1. Full text: the query, unaccented and tokenized, must match the
--      weighted series_search.document (all words required, last word as a
--      prefix so typing feels incremental). Ranked by ts_rank_cd.
--   2. Fuzzy supplement: when full text finds fewer than FUZZY_WHEN_UNDER
--      rows, rows within word_similarity reach of the query join the
--      results ("Olymipa", "capitol theater" vs Theatre). Fuzzy never
--      outranks a full text match: its text score is capped below the
--      full text floor. Measured on the built surface: a typo like
--      "Olymipa" scores 0.5 word_similarity against an Olympia document
--      while unrelated documents score 0.08 to 0.2, so the 0.4 threshold
--      separates them cleanly.
--
-- Ranking is a weighted blend, all components in 0..1, every constant
-- named and commented in the DECLARE block. With no query text the text
-- component is zero for every row and proximity plus time proximity
-- decide, so an empty query is the "what can I get to soonest" feed.
-- Distance uses half-life decay, not a cutoff: a strong match 12 miles
-- out can outrank a weak match at 3.
--
-- Occurrences: every row carries the series' next occurrence that
-- satisfies the temporal filters (day of week, venue-local date window),
-- cancelled nights excluded. Day and date filters therefore change which
-- occurrence a card shows, fixing the old mismatch where filtering to
-- Friday showed a Tuesday date. Dates compare against local_date, the
-- venue-local calendar day, so "tonight" means tonight where the venue
-- is. A mic keeps counting as "next" for START_GRACE after it starts:
-- the person in the parking lot at 8:30 still cares about the 8:00 mic.
-- When a temporal filter is active, series with no matching night drop
-- out; otherwise undated series stay, demoted by a zero time score.
--
-- Shape and why: two phases inside one statement. The ranking phase
-- scores a narrow tuple (ids, distance, score) for every candidate; the
-- enrichment phase joins card fields and counts spots for only the rows
-- that survived the limit, so the expensive parts never run on rows
-- nobody will see. The browse and text arms are separate UNION ALL
-- branches gated by one-time filters because they need different driving
-- indexes (venue GiST vs the two GIN indexes); a single WHERE covering
-- both forced sequential scans (measured: 124 to 169ms p50 at 5,020
-- series). plpgsql rather than sql for the same measured reason: SQL
-- functions carrying SET clauses replan on every call, and this body is
-- expensive to plan. Distances rank on the sphere, not the spheroid: the
-- difference is under half a percent and it is measurably cheaper.
--
-- Down migration: supabase/migrations/down/20260807000300_search_discover.down.sql

-- The SECURITY INVOKER functions below run private helpers as the API
-- role; default privileges only cover schema public, so grants are explicit.
grant execute on function private.unaccent_imm(text) to anon, authenticated, service_role;

-- Trigram candidates for a query. Its own function so the two planner
-- settings scope to exactly this one indexed probe: the GIN trigram cost
-- estimate is pessimistic enough that the planner otherwise picks a
-- sequential scan that recomputes word_similarity per row (measured 57ms
-- vs 4ms on the index at 5,020 documents). RLS on series_search still
-- applies: SECURITY INVOKER.
create function private.search_fuzzy_hits(p_qraw text)
returns table (series_id uuid, sim real)
language sql
stable
set search_path = ''
set enable_seqscan = off
set pg_trgm.word_similarity_threshold = 0.4
as $$
  select ss.series_id, public.word_similarity(p_qraw, ss.fuzzy)
  from public.series_search ss
  where p_qraw operator(public.<%) ss.fuzzy;
$$;
grant execute on function private.search_fuzzy_hits(text) to anon, authenticated, service_role;

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
  -- Phase two: enrich only the surviving rows. The spots count runs for at
  -- most p_limit rows here, never for every candidate.
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
