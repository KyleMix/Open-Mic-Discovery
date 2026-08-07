-- series_search: document content, weighting, accent folding, trigger sync,
-- and RLS. The search RPC has its own suite; this one proves the surface it
-- stands on stays in step with the source tables.
begin;
select plan(13);

-- Every seeded series has a search document (backfill ran).
select is(
  (select count(*)::int from mic_series s
   left join series_search ss on ss.series_id = s.id
   where ss.series_id is null),
  0,
  'every series has a search document'
);

-- Fixture: an accented venue, a host with a distinctive stage name, and a
-- series whose description carries a unique word.
insert into auth.users (id, email)
values ('a0000000-0000-4000-a000-00000000ceca', 'mccrary@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_producer, eula_version, moderation_status)
values ('a0000000-0000-4000-a000-00000000ceca', 'mccrary_test', 'Private Name', 'Maggie McCrary',
        'Seattle', 'WA', true, '1.0', 'approved');
insert into producer_profiles (profile_id) values ('a0000000-0000-4000-a000-00000000ceca');
insert into venues (id, name, address_line, neighborhood, city, region, location, moderation_status)
values ('b0000000-0000-4000-b000-00000000cafe', 'Café Réverie', '99 Accent Way', 'Capitol Hill', 'Seattle', 'WA',
        st_setsrid(st_makepoint(-122.32, 47.61), 4326)::geography, 'approved');
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, description,
                        rrule, anchor_date, start_time, timezone, signup_method, moderation_status)
values ('c0000000-0000-4000-c000-00000000cafe', 'b0000000-0000-4000-b000-00000000cafe',
        'a0000000-0000-4000-a000-00000000ceca', 'a0000000-0000-4000-a000-00000000ceca',
        'Reverie Open Mic', '{comedy}', 'A very galvanic Tuesday night.',
        'FREQ=WEEKLY;BYDAY=TU', current_date, '20:00', 'America/Los_Angeles', 'first_come', 'approved');

-- The insert trigger built the document, with the accents folded.
select ok(
  (select document @@ to_tsquery('simple', 'cafe & reverie')
   from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  'accented venue name matches unaccented query terms'
);
select ok(
  (select document @@ to_tsquery('simple', 'mccrary')
   from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  'host stage name is searchable'
);
select ok(
  (select document @@ to_tsquery('simple', 'galvanic')
   from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  'description words are searchable'
);
select ok(
  (select document @@ to_tsquery('simple', 'capitol')
   from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  'neighborhood is searchable'
);

-- The private display name must never be in the document.
select ok(
  (select not (document @@ to_tsquery('simple', 'private'))
   from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  'private display_name is not indexed'
);

-- Weighting: the title carries weight A, the description weight D.
select cmp_ok(
  (select ts_rank_cd(document, to_tsquery('simple', 'reverie'))
   from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  '>',
  (select ts_rank_cd(document, to_tsquery('simple', 'galvanic'))
   from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  'a title word outranks a description word'
);

-- Renaming the venue re-syncs every series at that venue.
update venues set name = 'The Renamed Room' where id = 'b0000000-0000-4000-b000-00000000cafe';
select ok(
  (select document @@ to_tsquery('simple', 'renamed')
   from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  'venue rename updates the search document'
);

-- A stage name change re-syncs the host's series.
update profiles set stage_name = 'Maggie Renamed' where id = 'a0000000-0000-4000-a000-00000000ceca';
select ok(
  (select not (document @@ to_tsquery('simple', 'mccrary'))
   from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  'stage name change removes the old name from the document'
);

-- Visibility: presence is the access control (the select policy is
-- unconditional so the GIN indexes stay usable under RLS), so hiding a
-- series must remove its document outright.
update mic_series set deleted_at = now() where id = 'c0000000-0000-4000-c000-00000000cafe';
select is(
  (select count(*)::int from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  0,
  'soft-deleting a series removes its search document'
);
update mic_series set deleted_at = null where id = 'c0000000-0000-4000-c000-00000000cafe';
select is(
  (select count(*)::int from series_search where series_id = 'c0000000-0000-4000-c000-00000000cafe'),
  1,
  'restoring a series restores its search document'
);
set local role anon;
select set_config('request.jwt.claims', '', true);
select cmp_ok(
  (select count(*)::int from series_search), '>', 0,
  'anon reads documents for visible series'
);
reset role;

-- Writes are trigger-only: no API role may modify the table directly.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-4000-a000-00000000ceca', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ insert into series_search (series_id, document, fuzzy)
     values ('c0000000-0000-4000-c000-00000000cafe', to_tsvector('x'), 'x') $$,
  '42501',
  'new row violates row-level security policy for table "series_search"',
  'authenticated cannot write search documents directly'
);
reset role;

select * from finish();
rollback;
