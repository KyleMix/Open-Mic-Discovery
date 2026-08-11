-- Indexes for the two seq-scanning people-search screens and the moderation
-- queue reads (pre-launch audit, performance section 5).
--
-- Every statement here is additive: an index cannot change query results, only
-- their cost. These run as plain CREATE INDEX because the migration chain
-- applies to a fresh project (empty tables, so the build is instant and the
-- brief lock is invisible). To add them to an ALREADY POPULATED database out of
-- band instead, build each with CREATE INDEX CONCURRENTLY, one at a time and
-- not inside a transaction, so the build does not hold a write lock.
--
-- Down migration: supabase/migrations/down/20260811000400_search_and_queue_indexes.down.sql

-- Already installed by 20260801000800; repeated so this migration is
-- self-contained about what its trigram indexes depend on.
create extension if not exists pg_trgm;

-- 1 and 2. People search. The Network people search and the credits person
-- picker both run `handle ilike '%term%'` and `stage_name ilike '%term%'`
-- through public_profiles. `handle` is citext unique (a btree a leading
-- wildcard cannot use) and `stage_name` had no index at all, so each keystroke
-- past two characters sequentially scanned profiles on two separate screens.
-- The 20260801000800 trigram indexes covered mic_series and venues and stopped
-- there. GIN + gin_trgm_ops is the shape that answers a leading wildcard; a
-- plain btree would look reassuring in a diff and do nothing here.
create index profiles_handle_trgm
  on public.profiles using gin (handle gin_trgm_ops);

create index profiles_stage_name_trgm
  on public.profiles using gin (stage_name gin_trgm_ops);

-- 3 to 6. Moderation queue reads. src/features/safety/queries.ts filters each
-- content table by `moderation_status = 'pending'` (with `deleted_at is null`
-- where the column exists). None of these tables had an index on the status,
-- so each queue read scanned the whole table. Partial indexes stay tiny (only
-- pending rows are stored) and match the exact predicate the queue uses.
create index profiles_pending_idx
  on public.profiles (created_at)
  where moderation_status = 'pending' and deleted_at is null;

create index venues_pending_idx
  on public.venues (created_at)
  where moderation_status = 'pending' and deleted_at is null;

create index mic_series_pending_idx
  on public.mic_series (created_at)
  where moderation_status = 'pending' and deleted_at is null;

create index mic_credits_pending_idx
  on public.mic_credits (created_at)
  where moderation_status = 'pending';

-- 7. Listing-flag queue. listing_flags_series_idx leads with series_id, so the
-- admin read `where status = 'open'` (no series_id) cannot use it. A partial
-- index on the open rows matches the queue read.
create index listing_flags_open_idx
  on public.listing_flags (created_at)
  where status = 'open';

-- Deliberately NOT here: reports (reports_queue_idx already covers the queue),
-- claim_requests (claim_requests_one_pending is a partial index on
-- status = 'pending' the admin read can use), and mic_occurrences
-- (mic_occurrences_series_idx is usable; revisit only if useNextNights becomes
-- a distinct-on RPC).
