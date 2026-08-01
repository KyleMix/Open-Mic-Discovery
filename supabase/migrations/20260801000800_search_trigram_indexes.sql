-- Make the search actually use an index.
--
-- search_mics matches with `title ilike '%' || q || '%'` across
-- mic_series.title, venues.name and venues.city. A leading wildcard cannot
-- use a btree index, so every keystroke sequentially scans every series and
-- every venue. That is survivable at 20 listings and is not at 20,000, and
-- discovery search is on the path a performer uses most.
--
-- Trigram GIN indexes are the fix, and the reason to prefer them here is that
-- they need no change to the query: pg_trgm teaches the planner to answer
-- ilike with an index, so search_mics keeps returning exactly the rows it
-- returns today in exactly the same order. Nothing about behaviour moves,
-- which is why this ships on its own rather than bundled with a ranking
-- change.
--
-- Deliberately not done here: typo tolerance. pg_trgm also offers similarity
-- matching (the % operator, similarity()), which would let "Capital Hill"
-- find "Capitol Hill". That changes which rows come back and how they rank,
-- so it is a product decision with its own tests, not a free consequence of
-- adding an index.
--
-- The extension lands in public to match postgis and citext, which the first
-- migration put there. All three are flagged by Supabase's advisor as
-- extension_in_public; moving them is a separate migration, because
-- relocating postgis means dropping and recreating every geography column.

create extension if not exists pg_trgm;

create index if not exists mic_series_title_trgm
  on public.mic_series using gin (title gin_trgm_ops);

create index if not exists venues_name_trgm
  on public.venues using gin (name gin_trgm_ops);

create index if not exists venues_city_trgm
  on public.venues using gin (city gin_trgm_ops);
