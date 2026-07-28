-- Home area tests: required presence, privacy, and location sync.
begin;
select plan(9);

-- Seeded demo users: p1 performer 00000000-...-0001 (Seattle, WA).

-- ---------------------------------------------------------------------------
-- Privacy: no location column leaks through any public surface
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public'
     and table_name in ('public_profiles', 'performer_public', 'producer_public', 'signup_roster')
     and column_name in
       ('home_city', 'home_region', 'home_postal_code', 'home_lat', 'home_lng', 'home_location')),
  0,
  'no view exposes any home area column'
);

-- The rebuilt views kept their grants.
set local role anon;
select set_config('request.jwt.claims', '', true);
select cmp_ok(
  (select count(*)::int from public_profiles), '>', 0,
  'anon still reads public_profiles after the rebuild'
);
reset role;

-- ---------------------------------------------------------------------------
-- Presence: city+state or ZIP is required
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$update profiles
    set home_city = null, home_region = null, home_postal_code = null
    where id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null,
  'a profile cannot drop its whole home area'
);

update profiles
set home_city = null, home_region = null, home_postal_code = '98101'
where id = '00000000-0000-4000-a000-000000000001';
select is(
  (select home_postal_code from profiles
   where id = '00000000-0000-4000-a000-000000000001'),
  '98101',
  'a ZIP alone satisfies the home area requirement'
);

select throws_ok(
  $$update profiles set home_postal_code = 'abcde'
    where id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null,
  'ZIP must be five digits'
);

update profiles
set home_city = 'Seattle', home_region = 'WA', home_postal_code = null
where id = '00000000-0000-4000-a000-000000000001';
select is(
  (select home_region from profiles
   where id = '00000000-0000-4000-a000-000000000001'),
  'WA',
  'city plus state satisfies the home area requirement'
);

-- ---------------------------------------------------------------------------
-- Location sync trigger
-- ---------------------------------------------------------------------------
update profiles set home_lat = 45.5152, home_lng = -122.6784
where id = '00000000-0000-4000-a000-000000000001';
select ok(
  (select st_dwithin(
     home_location,
     st_setsrid(st_makepoint(-122.6784, 45.5152), 4326)::geography,
     1)
   from profiles where id = '00000000-0000-4000-a000-000000000001'),
  'setting lat and lng mirrors into home_location'
);

update profiles set home_lat = null, home_lng = null
where id = '00000000-0000-4000-a000-000000000001';
select is(
  (select home_location from profiles
   where id = '00000000-0000-4000-a000-000000000001'),
  null,
  'clearing lat and lng clears home_location'
);

-- Direct server-side home_location writes are left alone (retention flows).
reset role;
update profiles set home_location = 'POINT(-122.33 47.60)'
where id = '00000000-0000-4000-a000-000000000001';
select ok(
  (select home_location is not null from profiles
   where id = '00000000-0000-4000-a000-000000000001'),
  'a direct home_location write is not clobbered by the sync trigger'
);

select * from finish();
rollback;
