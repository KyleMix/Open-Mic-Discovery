-- Paused listings leave text search, and every view states its own
-- RLS semantics out loud.
--
-- Three items from the audit (docs/audit/FINDINGS.md), all small, all in the
-- same area: things that are correct today but say so only in prose.
--
--   F-007 (part) search_mics never filtered s.is_active, so a producer who
--                switched their mic off was still returned by a public RPC.
--                mics_near has excluded paused listings since 20260803000600
--                and search_discover since 20260807000300; search_mics was
--                the one path left behind, and nothing asserted otherwise.
--   F-008        blocked_profiles is the one view with no explicit
--                security_invoker setting. It relies on the default, which is
--                owner semantics, which is genuinely what it wants. Saying so
--                in a comment is not something a test can read.
--   F-014        private.set_updated_at is the only function in the schema
--                without a pinned search_path.
--
-- The revoke half of F-007, retiring mics_near and search_mics from the API
-- roles entirely, is deliberately NOT here. Five pgTAP files exercise those
-- two functions specifically as anon, so retiring them means removing that
-- coverage in the same commit, which is a larger and more deliberate act than
-- this migration. It is queued as its own decision.
--
-- Down migration:
-- supabase/migrations/down/20260807000500_paused_listings_and_view_semantics.down.sql

-- ---------------------------------------------------------------------------
-- 1. search_mics excludes paused listings.
--
-- Body copied verbatim from the effective definition (20260806000100, with
-- the owner_id column from 20260804000100) with one clause added.
--
-- The added clause is `s.is_active and (...)`, not a fourth `and` on the end.
-- The three text matches are an unparenthesized OR chain, so appending
-- `and s.is_active` would have bound to the city match alone and filtered
-- nothing off a title or venue hit. Parenthesizing the chain is the fix.
--
-- Signature and return type are unchanged, so this is a genuine CREATE OR
-- REPLACE: the existing ACL is preserved and no default privilege is
-- re-applied behind our backs.
-- ---------------------------------------------------------------------------
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
  where s.is_active
    and (s.title ilike '%' || p_query || '%'
         or v.name ilike '%' || p_query || '%'
         or v.city ilike '%' || p_query || '%')
  order by
    (s.title ilike p_query || '%' or v.name ilike p_query || '%' or v.city ilike p_query || '%') desc,
    st_distance(v.location, ref.pt) asc nulls last,
    s.title
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- 2. blocked_profiles declares its owner semantics.
--
-- No behaviour change: unset already means security_invoker = off. What this
-- buys is that the setting becomes a fact in the catalog instead of a comment
-- in a migration, which is what the new pgTAP guard reads. The view still
-- needs owner semantics for the reason its own header gives: the point is to
-- read a profile the block otherwise hides, and `where b.blocker_id =
-- auth.uid()` is the access control.
--
-- ALTER rather than CREATE OR REPLACE, so the definition is not restated and
-- cannot drift from the original by a copy error.
-- ---------------------------------------------------------------------------
alter view blocked_profiles set (security_invoker = off);

-- ---------------------------------------------------------------------------
-- 3. The last unpinned search_path.
--
-- Not exploitable: the function is not SECURITY DEFINER and now() resolves
-- from pg_catalog, which is searched implicitly whatever the path says. It is
-- pinned so that "every function in this schema pins search_path" becomes a
-- rule with no exception, and a rule with no exception is one a reviewer can
-- check at a glance.
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
