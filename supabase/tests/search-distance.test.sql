-- search_mics with an optional center: distance shows up in text search.
begin;
select plan(5);

select has_function(
  'public', 'search_mics',
  array['text', 'double precision', 'double precision', 'integer'],
  'search_mics accepts an optional center'
);

-- Anonymous discovery still works, exactly like the rest of search.
set local role anon;

select is(
  (select count(*)::int from search_mics('Rusty Fret')),
  1,
  'search without a center still finds the mic'
);

select ok(
  (select distance_m is null from search_mics('Rusty Fret')),
  'distance_m is null when no center is given'
);

-- Center on downtown Seattle: The Rusty Fret is about 1.5 km away.
select ok(
  (select distance_m between 100 and 10000
   from search_mics('Rusty Fret', 47.6062, -122.3321)),
  'distance_m is a plausible meter count from the given center'
);

-- Portland is roughly 233 km from that Seattle venue.
select ok(
  (select distance_m > 200000
   from search_mics('Rusty Fret', 45.5152, -122.6784)),
  'distance_m tracks the center the caller passes'
);

select * from finish();
rollback;
