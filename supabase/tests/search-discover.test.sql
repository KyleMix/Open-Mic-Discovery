-- search_discover: the corpus from the search rebuild brief, ranking
-- semantics, filter composition, and exclusions. Fixtures cover what the
-- seed lacks: a theater/theatre venue pair, an accented cafe, a host with
-- a searchable surname, and a two-night-a-week mic for the day filter.
begin;
select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres; queries below run as anon).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values ('a0000000-0000-4000-a000-0000000000d1', 'host-mccrary@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_producer, eula_version, moderation_status)
values ('a0000000-0000-4000-a000-0000000000d1', 'mccrary_host', 'Private Person',
        'Maggie McCrary', 'Seattle', 'WA', true, '1.0', 'approved');
insert into producer_profiles (profile_id, verified)
values ('a0000000-0000-4000-a000-0000000000d1', true);

insert into venues (id, name, address_line, neighborhood, city, region, location,
                    age_restriction, moderation_status) values
  ('b0000000-0000-4000-b000-0000000000d1', 'Capitol Theatre', '206 5th Ave SE', 'Downtown',
   'Olympia', 'WA', st_setsrid(st_makepoint(-122.9007, 47.0430), 4326)::geography,
   'all_ages', 'approved'),
  ('b0000000-0000-4000-b000-0000000000d2', 'Café Río', '1000 E Pike St', 'Capitol Hill',
   'Seattle', 'WA', st_setsrid(st_makepoint(-122.3190, 47.6140), 4326)::geography,
   'twenty_one_plus', 'approved'),
  ('b0000000-0000-4000-b000-0000000000d3', 'Torchlight Lounge', '77 Torch St', 'Ballard',
   'Seattle', 'WA', st_setsrid(st_makepoint(-122.3860, 47.6680), 4326)::geography,
   null, 'approved'),
  ('b0000000-0000-4000-b000-0000000000d4', 'Torchlite Room', '79 Torch St', 'Ballard',
   'Seattle', 'WA', st_setsrid(st_makepoint(-122.3850, 47.6690), 4326)::geography,
   null, 'approved');

insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines,
                        rrule, anchor_date, start_time, timezone, signup_method,
                        cost_cents, last_confirmed_at, moderation_status) values
  -- The theater fixture, run by the searchable host, confirmed and verified.
  ('c0000000-0000-4000-c000-0000000000d1', 'b0000000-0000-4000-b000-0000000000d1',
   'a0000000-0000-4000-a000-0000000000d1', 'a0000000-0000-4000-a000-0000000000d1',
   'Theatre Open Mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=WE', current_date, '19:30',
   'America/Los_Angeles', 'first_come', 0, now(), 'approved'),
  -- The accented cafe.
  ('c0000000-0000-4000-c000-0000000000d2', 'b0000000-0000-4000-b000-0000000000d2',
   'a0000000-0000-4000-a000-0000000000d1', 'a0000000-0000-4000-a000-0000000000d1',
   'Rio Acoustic Night', '{music}', 'FREQ=WEEKLY;BYDAY=MO', current_date, '20:00',
   'America/Los_Angeles', 'first_come', 500, null, 'approved'),
  -- A mic that runs twice a week, for the day-filter assertion.
  ('c0000000-0000-4000-c000-0000000000d3', 'b0000000-0000-4000-b000-0000000000d3',
   'a0000000-0000-4000-a000-0000000000d1', 'a0000000-0000-4000-a000-0000000000d1',
   'Torchlight Showcase', '{comedy}', 'FREQ=WEEKLY;BYDAY=TU,FR', current_date, '21:00',
   'America/Los_Angeles', 'lottery', 0, now(), 'approved'),
  -- Near-duplicate name one street over, for the text-beats-fuzzy assertion.
  ('c0000000-0000-4000-c000-0000000000d4', 'b0000000-0000-4000-b000-0000000000d4',
   'a0000000-0000-4000-a000-0000000000d1', 'a0000000-0000-4000-a000-0000000000d1',
   'Torchlite Showcase', '{comedy}', 'FREQ=WEEKLY;BYDAY=TU', current_date, '21:00',
   'America/Los_Angeles', 'lottery', 0, now(), 'approved');

-- Credits. Inserted as postgres, which skips the moderation guard, so the
-- status is explicit: only approved credits may ever surface in search.
insert into mic_credits (series_id, occurrence_id, role, profile_id, name,
                         moderation_status, created_by) values
  -- The cafe mic: a linked host, whose stage name must beat the typed
  -- fallback, and a series-level featured default.
  ('c0000000-0000-4000-c000-0000000000d2', null, 'host',
   'a0000000-0000-4000-a000-0000000000d1', 'Typed Fallback', 'approved',
   'a0000000-0000-4000-a000-0000000000d1'),
  ('c0000000-0000-4000-c000-0000000000d2', null, 'featured', null,
   'Serena Series', 'approved', 'a0000000-0000-4000-a000-0000000000d1'),
  -- The torchlight mic: unlinked series defaults for both roles.
  ('c0000000-0000-4000-c000-0000000000d3', null, 'host', null, 'Hank Host',
   'approved', 'a0000000-0000-4000-a000-0000000000d1'),
  ('c0000000-0000-4000-c000-0000000000d3', null, 'featured', null,
   'Serena Series Three', 'approved', 'a0000000-0000-4000-a000-0000000000d1'),
  -- The torchlite mic: a pending credit, which must never surface.
  ('c0000000-0000-4000-c000-0000000000d4', null, 'host', null, 'Pending Host',
   'pending', 'a0000000-0000-4000-a000-0000000000d1');

-- The cafe mic's next night gets both a featured credit override and typed
-- occurrence text, so precedence among all three featured sources is
-- observable on one row. The night lookup mirrors the RPC's own next-night
-- rule, start grace included, so both pick the same occurrence whatever the
-- wall clock says.
insert into mic_credits (series_id, occurrence_id, role, name, moderation_status, created_by)
select 'c0000000-0000-4000-c000-0000000000d2', o.id, 'featured', 'Nova Nightly',
       'approved', 'a0000000-0000-4000-a000-0000000000d1'
from mic_occurrences o
where o.series_id = 'c0000000-0000-4000-c000-0000000000d2'
  and o.status <> 'cancelled' and o.starts_at >= now() - interval '60 minutes'
order by o.starts_at limit 1;

update mic_occurrences set featured_name = 'Tessa Typed'
where id = (
  select o.id from mic_occurrences o
  where o.series_id = 'c0000000-0000-4000-c000-0000000000d2'
    and o.status <> 'cancelled' and o.starts_at >= now() - interval '60 minutes'
  order by o.starts_at limit 1);

-- The torchlight mic's next night gets typed text only: it must beat the
-- series-level featured credit.
update mic_occurrences set featured_name = 'Tessa Typed Three'
where id = (
  select o.id from mic_occurrences o
  where o.series_id = 'c0000000-0000-4000-c000-0000000000d3'
    and o.status <> 'cancelled' and o.starts_at >= now() - interval '60 minutes'
  order by o.starts_at limit 1);

set local role anon;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- The corpus.
-- ---------------------------------------------------------------------------

-- Empty query: a useful browse feed, ranked.
select cmp_ok(
  (select count(*)::int from search_discover(null, 47.6062, -122.3321)), '>', 10,
  'empty query returns the nearby feed'
);
select is(
  (select rank_score from search_discover(null, 47.6062, -122.3321) limit 1),
  (select max(rank_score) from search_discover(null, 47.6062, -122.3321)),
  'browse results lead with the highest blend score'
);

-- Whitespace and punctuation-only queries browse instead of failing.
select is(
  (select count(*)::int from search_discover('   ', 47.6062, -122.3321)),
  (select count(*)::int from search_discover(null, 47.6062, -122.3321)),
  'whitespace query is treated as browsing'
);
select is(
  (select count(*)::int from search_discover('&!()', 47.6062, -122.3321)),
  (select count(*)::int from search_discover(null, 47.6062, -122.3321)),
  'punctuation-only query is treated as browsing'
);

-- City search, exact and with a typo.
select cmp_ok(
  (select count(*)::int from search_discover('olympia', 47.6062, -122.3321)), '>=', 3,
  'city search finds the Olympia mics'
);
select cmp_ok(
  (select count(*)::int from search_discover('Olymipa', 47.6062, -122.3321)
   where match_kind = 'fuzzy'), '>=', 3,
  'the Olymipa typo still finds the Olympia mics through the fuzzy pass'
);

-- Venue search tolerant of the theater/theatre spelling.
select ok(
  exists(select 1 from search_discover('capitol theater', 47.6062, -122.3321)
         where venue_name = 'Capitol Theatre'),
  'capitol theater finds the Capitol Theatre'
);

-- Accent folding in both directions.
select ok(
  exists(select 1 from search_discover('cafe rio', 47.6062, -122.3321)
         where venue_name = 'Café Río'),
  'unaccented query finds the accented venue'
);
select ok(
  exists(select 1 from search_discover('café río', 47.6062, -122.3321)
         where venue_name = 'Café Río'),
  'accented query finds the accented venue'
);

-- Host search by stage name.
select ok(
  exists(select 1 from search_discover('mccrary', 47.6062, -122.3321)
         where series_id = 'c0000000-0000-4000-c000-0000000000d1'),
  'a host stage name surfaces their mics'
);

-- Garbage returns nothing (the client recovery ladder builds on this).
select is(
  (select count(*)::int from search_discover('zzzzzz', 47.6062, -122.3321)),
  0,
  'a nonsense query returns zero rows'
);

-- ---------------------------------------------------------------------------
-- Ranking semantics.
-- ---------------------------------------------------------------------------

-- A full text match always outranks a fuzzy near-miss of the same query.
select is(
  (select match_kind from search_discover('torchlight', 47.6062, -122.3321) limit 1),
  'text',
  'the exact torchlight match leads'
);
select ok(
  exists(select 1 from search_discover('torchlight', 47.6062, -122.3321)
         where match_kind = 'fuzzy' and title = 'Torchlite Showcase'),
  'the torchlite near-duplicate still appears through the fuzzy pass'
);
select cmp_ok(
  (select min(rank_score) from search_discover('torchlight', 47.6062, -122.3321)
   where match_kind = 'text'),
  '>',
  (select max(rank_score) from search_discover('torchlight', 47.6062, -122.3321)
   where match_kind = 'fuzzy'),
  'every full text match outranks every fuzzy match'
);

-- Browse rows never carry a night more than the start grace in the past.
select is(
  (select count(*)::int from search_discover(null, 47.6062, -122.3321)
   where next_starts_at < now() - interval '60 minutes'),
  0,
  'no result carries a night older than the start grace'
);

-- ---------------------------------------------------------------------------
-- Occurrence resolution.
-- ---------------------------------------------------------------------------

-- The day filter resolves the occurrence on the filtered day: the Tue+Fri
-- mic shows its Friday when filtered to Friday.
select is(
  (select extract(isodow from next_local_date)::int
   from search_discover(null, 47.6062, -122.3321, null, null, '{5}')
   where series_id = 'c0000000-0000-4000-c000-0000000000d3'),
  5,
  'a Friday filter shows the Tue+Fri mic on its Friday'
);

-- A venue-local date window only returns nights inside it.
select is(
  (select count(*)::int
   from search_discover(null, 47.6062, -122.3321, null, null, null,
                        current_date, current_date)
   where next_local_date <> current_date),
  0,
  'a single-day window never shows another day'
);

-- Cancelling the next night moves the result to the following one.
reset role;
update mic_occurrences set status = 'cancelled'
where id = (
  select o.id from mic_occurrences o
  where o.series_id = 'c0000000-0000-4000-c000-0000000000d1' and o.starts_at >= now()
  order by o.starts_at limit 1
);
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(
  (select next_starts_at from search_discover('mccrary', 47.6062, -122.3321)
   where series_id = 'c0000000-0000-4000-c000-0000000000d1'),
  (select min(o.starts_at) from mic_occurrences o
   where o.series_id = 'c0000000-0000-4000-c000-0000000000d1'
     and o.starts_at >= now() and o.status <> 'cancelled'),
  'a cancelled night is skipped in favor of the next scheduled one'
);

-- ---------------------------------------------------------------------------
-- Credits on the card: host and featured resolve per row.
-- ---------------------------------------------------------------------------

-- A linked host credit resolves through the profile, so the stage name wins
-- over the typed fallback.
select is(
  (select host_name from search_discover(null, 47.6062, -122.3321)
   where series_id = 'c0000000-0000-4000-c000-0000000000d2'),
  'Maggie McCrary',
  'a linked host credit shows the stage name on the search row'
);

-- A series-level host credit covers every night without an override.
select is(
  (select host_name from search_discover(null, 47.6062, -122.3321)
   where series_id = 'c0000000-0000-4000-c000-0000000000d3'),
  'Hank Host',
  'a series host credit names the host on the search row'
);

-- Featured precedence, most specific first: the night credit beats both the
-- occurrence's typed text and the series default.
select is(
  (select featured_name from search_discover(null, 47.6062, -122.3321)
   where series_id = 'c0000000-0000-4000-c000-0000000000d2'),
  'Nova Nightly',
  'a night featured credit beats the typed text and the series default'
);

-- Typed occurrence text is per-night information, so it beats the series
-- default credit when no night credit exists.
select is(
  (select featured_name from search_discover(null, 47.6062, -122.3321)
   where series_id = 'c0000000-0000-4000-c000-0000000000d3'),
  'Tessa Typed Three',
  'typed featured text on the night beats the series featured credit'
);

-- A pending credit never surfaces: the row shows no host at all.
select is(
  (select host_name from search_discover(null, 47.6062, -122.3321)
   where series_id = 'c0000000-0000-4000-c000-0000000000d4'),
  null::text,
  'a pending host credit never reaches the search row'
);

-- No credit and no typed name: both columns stay null and the card shows
-- neither line.
select is(
  (select featured_name from search_discover(null, 47.6062, -122.3321)
   where series_id = 'c0000000-0000-4000-c000-0000000000d4'),
  null::text,
  'a mic with no featured credit and no typed name shows nothing'
);

-- ---------------------------------------------------------------------------
-- Filters compose with text, and exclusions hold.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
   from search_discover('olympia', 47.6062, -122.3321, null, null, null, null, null, true)
   where cost_cents > 0),
  0,
  'free-only composes with a text query'
);
select is(
  (select count(*)::int
   from search_discover(null, 47.6062, -122.3321, null, null, null, null, null,
                        false, null, '{all_ages}'::age_restriction[])
   where series_id = 'c0000000-0000-4000-c000-0000000000d2'),
  0,
  'the age filter excludes a twenty-one-plus venue'
);

-- Paused mics never search.
reset role;
update mic_series set is_active = false where id = 'c0000000-0000-4000-c000-0000000000d1';
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from search_discover('capitol theater', 47.6062, -122.3321)
   where series_id = 'c0000000-0000-4000-c000-0000000000d1'),
  0,
  'a paused mic is excluded from search'
);

select * from finish();
rollback;
