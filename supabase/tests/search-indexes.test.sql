-- Search index tests. Runs under pgTAP inside a rolled-back transaction.
--
-- search_mics matches with a leading wildcard, which no btree index can
-- answer. These assertions pin the trigram indexes that make it answerable,
-- and pin the behaviour that must not have changed when they were added.
begin;
select plan(12);

select is(
  (select count(*)::int from pg_extension where extname = 'pg_trgm'),
  1,
  'pg_trgm is installed, without it the ilike search cannot use an index'
);

-- The index has to be GIN with trigram ops specifically. A plain btree on the
-- same column would exist, look reassuring in a schema diff, and do nothing
-- for a leading wildcard.
create function pg_temp.is_trgm_gin(p_index text) returns boolean language sql stable as $$
  select exists (
    select 1
      from pg_class i
      join pg_index x on x.indexrelid = i.oid
      join pg_am am on am.oid = i.relam
      join pg_opclass oc on oc.oid = x.indclass[0]
     where i.relname = p_index
       and am.amname = 'gin'
       and oc.opcname = 'gin_trgm_ops'
  );
$$;

select ok(pg_temp.is_trgm_gin('mic_series_title_trgm'),
  'mic_series.title has a trigram GIN index');
select ok(pg_temp.is_trgm_gin('venues_name_trgm'),
  'venues.name has a trigram GIN index');
select ok(pg_temp.is_trgm_gin('venues_city_trgm'),
  'venues.city has a trigram GIN index');

-- People search (20260811000400). handle is a citext unique btree a leading
-- wildcard cannot use, and stage_name had no index at all, so both people
-- screens seq scanned profiles. Same trigram-GIN requirement as above.
select ok(pg_temp.is_trgm_gin('profiles_handle_trgm'),
  'profiles.handle has a trigram GIN index');
select ok(pg_temp.is_trgm_gin('profiles_stage_name_trgm'),
  'profiles.stage_name has a trigram GIN index');

-- The moderation-queue partial indexes exist and are partial (a full-table
-- index would work but defeats the point of a tiny pending-only index).
select ok(
  (select count(*)::int from pg_class i
     join pg_index x on x.indexrelid = i.oid
    where i.relname in ('profiles_pending_idx', 'venues_pending_idx',
                        'mic_series_pending_idx', 'mic_credits_pending_idx',
                        'listing_flags_open_idx')
      and x.indpred is not null) = 5,
  'the five moderation-queue reads each have a partial index');

-- ---------------------------------------------------------------------------
-- Behaviour is unchanged. The indexes were added precisely so that the query
-- did not have to move, so these are the assertions that would catch a
-- "while I am here" rewrite of search_mics.
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '', true);

select cmp_ok(
  (select count(*)::int from search_mics('seattle')), '>', 0,
  'searching a seeded city still returns listings'
);
select is(
  (select count(*)::int from search_mics('zzzzznotathing')), 0,
  'a query matching nothing still returns nothing'
);
select cmp_ok(
  (select count(*)::int from search_mics('SEATTLE')), '>', 0,
  'search is still case insensitive'
);
select is(
  (select count(*)::int from search_mics('SEATTLE')),
  (select count(*)::int from search_mics('seattle')),
  'upper and lower case return the same number of rows'
);
select cmp_ok(
  (select count(*)::int from search_mics('eattl')), '>', 0,
  'a match in the middle of a word still works, which is the case an index on a leading wildcard has to keep answering'
);

select * from finish();
rollback;
