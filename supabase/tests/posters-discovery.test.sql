-- Posters flow into discovery results.
begin;
select plan(3);

-- Give the seeded Rusty Fret series a poster as its owner would.
update mic_series
set poster_url = 'https://example.com/posters/rusty-fret.jpg'
where id = '20000000-0000-4000-c000-000000000001';

set local role anon;

select ok(
  exists (
    select 1 from mics_near(47.6062, -122.3321)
    where poster_url = 'https://example.com/posters/rusty-fret.jpg'
  ),
  'a poster set by the producer appears in nearby results'
);

select ok(
  exists (
    select 1 from mics_near(47.6062, -122.3321) where poster_url is null
  ),
  'mics without posters still return with a null poster_url'
);

select is(
  (select count(*)::int from mics_near(47.6062, -122.3321, 2000)
   where series_id = '20000000-0000-4000-c000-000000000001'),
  1,
  'the rebuilt function still filters by radius'
);

select * from finish();
rollback;
