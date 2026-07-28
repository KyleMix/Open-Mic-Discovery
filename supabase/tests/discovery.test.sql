-- Discovery RPC tests: radius, ordering, filters, search, and RLS pass-through.
begin;
select plan(12);

-- All calls run as anon: discovery is an anonymous surface, and the RPCs are
-- SECURITY INVOKER so table RLS applies.
set local role anon;
select set_config('request.jwt.claims', '', true);

-- Reference point: Capitol Hill, Seattle (Cal Anderson Park).
-- 3 km radius covers Capitol Hill and Pioneer Square, not Ballard/Portland.
select cmp_ok(
  (select count(*)::int from mics_near(47.6174, -122.3199, 3000)), '>=', 3,
  'a 3 km Capitol Hill radius finds central Seattle mics'
);
select is(
  (select count(*)::int from mics_near(47.6174, -122.3199, 3000) where city <> 'Seattle'),
  0,
  'a 3 km radius never returns other cities'
);
select is(
  (select count(*)::int from mics_near(47.6174, -122.3199, 400000) where city = 'Portland'),
  4,
  'a 400 km radius reaches the Portland mics'
);

-- Nearest-neighbor ordering: the first result from the Velvet Antler's own
-- doorstep is the Velvet Antler.
select is(
  (select title from mics_near(47.6139, -122.3195, 5000) limit 1),
  'Velvet Antler Comedy Open Mic',
  'results are ordered nearest first'
);

-- Distance is reported in meters and grows monotonically.
select is(
  (select count(*)::int from (
     select distance_m - lag(distance_m) over () as d
     from mics_near(47.6174, -122.3199, 400000)
   ) x where d < 0),
  0,
  'distance_m is monotonically non-decreasing'
);

-- Filters.
select is(
  (select count(*)::int from mics_near(47.6174, -122.3199, 400000, '{poetry}'::discipline[])
   where not (disciplines && '{poetry}'::discipline[])),
  0,
  'discipline filter returns only matching series'
);
select is(
  (select count(*)::int from mics_near(47.6174, -122.3199, 400000, null, null, true)
   where cost_cents > 0),
  0,
  'free-only filter excludes paid mics'
);
select is(
  (select count(*)::int
   from mics_near(47.6174, -122.3199, 400000, null, null, false, '{lottery}'::signup_method[])
   where signup_method <> 'lottery'),
  0,
  'signup method filter holds'
);
select is(
  (select count(*)::int from mics_near(47.6174, -122.3199, 400000, null, '{2}'::int[])
   where series_id = '20000000-0000-4000-c000-000000000001'),
  1,
  'day-of-week filter (Tuesday) includes the Tuesday mic'
);

-- Every returned series carries its next upcoming occurrence.
select is(
  (select count(*)::int from mics_near(47.6174, -122.3199, 400000)
   where next_starts_at is not null and next_starts_at < now()),
  0,
  'next occurrence is never in the past'
);

-- Text search.
select is(
  (select title from search_mics('wildflower') limit 1),
  'Wildflower Poetry Night',
  'search finds a mic by venue name'
);
select is(
  (select count(*)::int from search_mics('Olympia')),
  2,
  'search by city returns that city''s mics'
);

select * from finish();
rollback;
