-- APPLIED 2026-08-11 as supabase/migrations/20260811000400_search_and_queue_indexes.sql
-- (with a down file and assertions in search-indexes.test.sql). This file is
-- retained only as the original proposal; the live version uses plain CREATE
-- INDEX because the migration chain applies to a fresh project. The rest of
-- this text is the record of what it addressed.
--
-- Do not place this in supabase/migrations/ until reviewed. When approved,
-- move it there under a fresh timestamp and add a matching down/ file that
-- drops each index, following the repo's migration discipline.
--
-- Every statement is additive (CREATE INDEX only), so applying it cannot
-- change query results, only their cost. Prefer CREATE INDEX CONCURRENTLY on
-- the hosted project so the build does not hold a write lock; CONCURRENTLY
-- cannot run inside a transaction, so run these one at a time, not wrapped in
-- begin/commit, and not through `supabase db push` (which wraps migrations).
--
-- Rationale per index is inline. Sources are the query patterns found in the
-- performance pass; see AUDIT-REPORT.md section 5.

-- 1 and 2. People search. Both the Network people search and the credits
-- person picker run `handle ilike '%term%'` and `stage_name ilike '%term%'`
-- through public_profiles. `handle` is citext unique (a btree that a leading
-- wildcard cannot use) and `stage_name` has no index at all, so each keystroke
-- past two characters sequentially scans profiles on two separate screens.
-- The existing search trigram indexes (20260801000800) covered mic_series and
-- venues but stopped there.
create extension if not exists pg_trgm;

create index if not exists profiles_handle_trgm
  on public.profiles using gin (handle gin_trgm_ops);

create index if not exists profiles_stage_name_trgm
  on public.profiles using gin (stage_name gin_trgm_ops);

-- 3 to 6. Moderation queue reads. src/features/safety/queries.ts filters each
-- content table by `moderation_status = 'pending'` with `deleted_at is null`.
-- None of the four base tables has an index on moderation_status, so the queue
-- read scans each table. Partial indexes keep them tiny (only pending rows are
-- ever stored in the index) and match the exact predicate the queue uses.
create index if not exists profiles_pending_idx
  on public.profiles (created_at)
  where moderation_status = 'pending' and deleted_at is null;

create index if not exists venues_pending_idx
  on public.venues (created_at)
  where moderation_status = 'pending' and deleted_at is null;

create index if not exists mic_series_pending_idx
  on public.mic_series (created_at)
  where moderation_status = 'pending' and deleted_at is null;

create index if not exists mic_credits_pending_idx
  on public.mic_credits (created_at)
  where moderation_status = 'pending';

-- 7. Listing-flag queue. listing_flags_series_idx leads with series_id, so the
-- admin read `where status = 'open'` (no series_id) cannot use it. A partial
-- index on the open rows matches the queue read.
create index if not exists listing_flags_open_idx
  on public.listing_flags (created_at)
  where status = 'open';

-- Note on what is deliberately NOT here:
--   * reports: reports_queue_idx (status, created_at) already covers the queue.
--   * claim_requests: claim_requests_one_pending is a partial index on
--     `status = 'pending'`, which the admin pending-claims read can use.
--   * favorites.series_id, profiles/venues geography GiST: already present.
--   * mic_occurrences (series_id, status, starts_at): mic_occurrences_series_idx
--     (series_id, starts_at) is usable; the status filter is cheap after it.
--     Revisit only if useNextNights becomes a distinct-on RPC.
