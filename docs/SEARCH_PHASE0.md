# Search Rebuild, Phase 0: Diagnosis

Date: 2026-08-07. Read-only inventory of the current search implementation, measured baselines, and a ranked defect list. No code, schema, or behavior was changed for this report. Benchmarks ran against a throwaway local database built by `scripts/db/verify-local.sh` (Postgres 16 with PostGIS and pgTAP in this container), rebuilt to pristine afterward.

## 1. Every entry point into search

There is exactly one text search surface in the app, plus a browse feed that shares its screen.

| Entry point                 | Where                                        | What it queries                                                                                                                         |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Search bar                  | Discover tab, `src/app/(tabs)/index.tsx:144` | `search_mics` RPC once 2+ trimmed chars are typed                                                                                       |
| Browse feed (default state) | Same screen, below the bar                   | `mics_near` RPC, always running                                                                                                         |
| Map view                    | Toggle on the same screen, `mic-map.tsx`     | No query of its own: client-side supercluster over the same `mics_near` rows. Panning does not re-query; there is no "search this area" |
| Filter bar + sheet          | `filter-bar.tsx`, `filter-sheet.tsx`         | Mutates the Zustand filter store, which re-keys the `mics_near` query. Filters apply to browse only, never to text search               |
| "Show mics near [query]"    | Header/empty state of search results         | Not a server search: device geocoder (`Location.geocodeAsync`) resolves the text to coordinates and recenters the browse feed           |
| Locate me button            | Search row                                   | Foreground location permission, then recenters browse                                                                                   |
| Deep links                  | `/mic/[id]` only                             | No search or query-state deep link exists                                                                                               |
| Favorites, Going tabs       | Own queries by id                            | No search path                                                                                                                          |
| Producer (My Mics)          | `useMySeries`                                | Own listings by owner/creator id. No search input anywhere in producer surfaces                                                         |

The search bar and the browse feed are mutually exclusive views of the same screen: at 2+ typed characters the filter bar and browse list unmount and the search result list replaces them (`index.tsx:208`).

## 2. The full query path

Typing flows through: `TextInput` (`index.tsx:144`) -> local `search` state -> `useDebounced(search, 300)` (`index.tsx:78`, 300ms trailing timer) -> `useSearchMics(debouncedSearch, center)` (`src/features/discovery/queries.ts:27`) -> TanStack Query keyed `['mics', 'search', trimmed, center]`, `enabled: trimmed.length >= 2`, `placeholderData: keepPreviousData` -> `supabase.rpc('search_mics', { p_query, p_lat, p_lng })` -> PostgREST `POST /rpc/search_mics` -> SQL function.

The definitive SQL (both discovery functions were last rebuilt in `supabase/migrations/20260806000100_discovery_unified.sql`; SECURITY INVOKER, so RLS hides soft-deleted and unapproved rows):

```sql
create function search_mics(
  p_query text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit integer default 50
)
returns table (...)  -- 22 cols: series/venue card fields, distance_m, next_starts_at; NO is_active
language sql stable
as $$
  with ref as (
    select case when p_lat is null or p_lng is null then null::geography
      else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as pt
  )
  select s.id, s.title, ..., st_distance(v.location, ref.pt), n.starts_at, ...
  from mic_series s
  join venues v on v.id = s.venue_id
  cross join ref
  left join lateral (
    select o.starts_at, o.featured_name,
           (select count(*)::int from signups sg
             where sg.occurrence_id = o.id
               and sg.status in ('confirmed', 'drawn', 'performed')) as taken
    from mic_occurrences o
    where o.series_id = s.id and o.starts_at >= now() and o.status <> 'cancelled'
    order by o.starts_at
    limit 1
  ) n on true
  where s.title ilike '%' || p_query || '%'
     or v.name ilike '%' || p_query || '%'
     or v.city ilike '%' || p_query || '%'
  order by
    (s.title ilike p_query || '%' or v.name ilike p_query || '%' or v.city ilike p_query || '%') desc,
    st_distance(v.location, ref.pt) asc nulls last,
    s.title
  limit p_limit;
$$;
```

The browse feed's `mics_near(p_lat, p_lng, p_radius_m default 40000, p_disciplines, p_days, p_free_only, p_methods, p_start_hour, p_end_hour, p_limit default 100)` is the same series+venue join with the same next-occurrence lateral, filtered by `st_dwithin(v.location, ref.pt, p_radius_m)` and `s.is_active`, with all filter params server-side.

Indexes hit: `venues_location_gist` (GiST) serves `st_dwithin` and the `<->` KNN in `mics_near`. `mic_occurrences_series_idx (series_id, starts_at)` serves the next-occurrence lateral in both functions. The three trigram GIN indexes added by `20260801000800_search_trigram_indexes.sql` (`mic_series.title`, `venues.name`, `venues.city`) are never used by `search_mics`: the three-way OR spans two joined tables, so the planner cannot push any single-table index scan. Captured plan for the function body (zero-hit query, scaled dataset):

```
Hash Join (actual rows=0)
  Join Filter: ((s.title ~~* '%zzzzzz%') OR (v.name ~~* '%zzzzzz%') OR (v.city ~~* '%zzzzzz%'))
  Rows Removed by Join Filter: 5020
  -> Seq Scan on mic_series s  (rows=5020)
  -> Hash  -> Seq Scan on venues v  (rows=3018)
```

Every keystroke sequentially scans every series and every venue. The migration that added the indexes predicted they would serve this query as written; the cross-table OR defeats that.

## 3. What is searchable, and how

| Field                    | Matched | How                                                        |
| ------------------------ | ------- | ---------------------------------------------------------- |
| `mic_series.title`       | yes     | `ilike '%q%'`, contiguous substring, case-insensitive      |
| `venues.name`            | yes     | same                                                       |
| `venues.city`            | yes     | same                                                       |
| `venues.neighborhood`    | no      | "capitol" returns 0 in a dataset full of Capitol Hill mics |
| `venues.address_line`    | no      |                                                            |
| `mic_series.description` | no      |                                                            |
| host / producer name     | no      | not joined at all                                          |
| region, tags             | no      | no tags field exists; region unsearched                    |

The whole query string must be one contiguous substring of one field: "open mic" matches "Rusty Fret Open Mic", but "open mic tonight" matches nothing. No word splitting, no full text search, no typo tolerance, no accent folding (`unaccent` is not installed; extensions present: postgis, citext, pg_trgm, pg_cron, pg_net).

## 4. Recurring events in search

The model materializes occurrences: `mic_occurrences` holds concrete rows on a rolling 90-day window per series (nightly pg_cron top-up plus a trigger on series changes; idempotent on `(series_id, local_date)`). There is no EXDATE list; skipping a night is `status = 'cancelled'` on its occurrence row.

Search matches against the series row, then decorates each hit with its next occurrence via the lateral join (`starts_at >= now() and status <> 'cancelled'`, earliest first, limit 1). So:

- One result per series, never one per future occurrence. Correct.
- Cancelled nights are skipped in the "next" computation. Correct.
- A weekly Tuesday mic matched on a Thursday shows one row with next Tuesday's date, rendered venue-local by `formatNextDate(next_starts_at, timezone)`. Verified on the seeded biweekly Tuesday mic: queried on Thursday 2026-08-06, the row carried `next_starts_at = 2026-08-19 01:30Z`, which renders as Tuesday Aug 18, 6:30 PM venue time. This part is sound.
- But: a series whose window holds no upcoming occurrence (all cancelled, or generation stale) still matches and returns `next_starts_at = null`; the ranking does not demote it and the row renders undated. Verified by cancelling all of one series' occurrences.
- And: search results are decorated with the next occurrence but never filtered or ranked by it. Time until the next night plays no part in matching or ordering.

The browse feed's day filter has the subtler recurrence confusion: `p_days` matches a series if any non-cancelled occurrence in the next 14 days falls on a chosen ISO weekday, while the card still shows the series' single next occurrence, which can be a different day (a Tue+Fri mic filtered to Friday shows Tuesday's date). The "Tonight" and "This weekend" chips paper over this client-side (`date-window.ts` bounds by actual date), with a documented known limit: a Tue+Fri mic drops out of "This weekend" entirely because the feed carries only the Tuesday occurrence.

## 5. Default state

Before typing, the screen is the browse feed:

- Center: profile home area (required at onboarding) -> else Seattle downtown with a visible "Showing the default Seattle area" note. Manual overrides: locate button, "Show mics near" geocode.
- Radius: 40 km (25 miles) default. The current value is visible only inside the More filters sheet; the badge counts it only when changed.
- Disciplines: silently pre-seeded once from the performer's own profile disciplines (`seedDisciplines`, `index.tsx:67`). Visible as active chips, but a comedy performer never sees music mics until they notice and clear a chip they did not set.
- Status: `is_active` only, server-side; client re-filters `is_active !== false` defensively. Soft-deleted and unapproved rows are excluded by RLS.
- No date window: any series with any future occurrence appears, ordered soonest first; series with no upcoming night sort last (undated cards).
- Persisted across launches (Zustand + AsyncStorage): disciplines, radius, freeOnly, methods, timeOfDay, view. Session-only by design: day picks and the Tonight/Weekend date bound.
- Sort: server orders by next `local_date`, then freshness tier (14/45-day buckets), then KNN distance; the client then re-sorts with `sortSoonestNearest` (same idea, different bucketing; see defect B3).

So the empty state is genuinely useful (close to the target model already); the gaps are hidden defaults and that typing anything abandons all of it (see B6/D1).

## 6. Request lifecycle

- Debounce: 300ms trailing (`useDebounced`, `index.tsx:270`). Target says roughly 250ms.
- Stale overwrite: cannot happen. Each query string is its own TanStack Query cache key, so a slow "ol" response lands in the "ol" cache entry, not on "olympia" (confirmed by reading the keying; there is no shared mutable result state). What the user sees while "olympia" loads is the previous key's data via `keepPreviousData`, without any staleness indicator.
- Cancellation: none. No `AbortController`/`abortSignal` anywhere in `src/`. Superseded requests run to completion, wasting cellular bandwidth and Postgres time, but their results are cached under their own keys, not displayed.
- Retry: global `retry: 2` (`query-client.ts:30`) applies to search; a failing search waits through two exponential backoff retries (roughly 3s) before the error state renders.
- First-search render: full-screen "Searching" spinner replaces the browse feed (no skeleton rows, no dimmed previous content). Subsequent refinements keep previous results via `keepPreviousData`.
- Mode flip mismatch: the screen switches to search mode on the raw input (`search.trim().length >= 2`, `index.tsx:84`) but results follow the debounced value, so for up to 300ms the search pane can show results for a query the user has already replaced, or the spinner.
- Offline: query cache is persisted to AsyncStorage (24h gcTime) and an offline banner labels cached content; a cold search with no connection retries then errors.

## 7. Ranking today

`search_mics` ORDER BY, exactly:

```sql
order by
  (s.title ilike p_query || '%' or v.name ilike p_query || '%' or v.city ilike p_query || '%') desc,
  st_distance(v.location, ref.pt) asc nulls last,
  s.title
```

A boolean prefix-match flag, then raw distance, then title. No text-relevance grading beyond prefix-or-not, no time-to-next-occurrence, no freshness or confidence signal, no distance decay (a match 142 miles away simply sorts after one 4 miles away, which is fine, but a mic starting in two hours 12 miles out cannot beat a mic in nine days at 3 miles). Series with no upcoming night are not demoted.

`mics_near` ORDER BY: `(n.local_date is null), n.local_date, <freshness tier case: 0 if confirmed within 14d, 1 within 45d, else 2>, v.location <-> ref.pt`. The client then re-sorts with `sortSoonestNearest` (day bucket, freshness tier, distance), which buckets days in the viewer's timezone (B3).

## 8. Baseline metrics

Environment: Postgres 16.13 in this container, function bodies benchmarked via repeated execution (bench harness, clock_timestamp percentiles), superuser session (RLS bypassed, so real anon calls pay slightly more). Two datasets: the seed (20 series, 18 venues, 203 occurrences) and a synthetic scale-up (5,020 series, 3,018 venues, 65,203 occurrences, all within about 50 miles of Seattle, about 40% of titles containing "Open Mic").

Server-side query time:

| Query                                         | Seed p50 / p95 | Scaled p50 / p95 |
| --------------------------------------------- | -------------- | ---------------- |
| `mics_near` defaults (40 km, no filters)      | 1.0 / 1.4 ms   | 27.8 / 31.5 ms   |
| `mics_near` + day filter                      |                | 25.4 / 26.6 ms   |
| `search_mics` "open mic"                      |                | 31.3 / 32.5 ms   |
| `search_mics` "olympia"                       | 0.7 / 0.8 ms   | 23.8 / 24.9 ms   |
| `search_mics` "ca" (minimum the client sends) |                | 21.9 / 22.8 ms   |
| `search_mics` "zzzzzz" (zero hits)            | 0.7 / 0.8 ms   | 13.5 / 14.0 ms   |

Every search is seq-scan bound (plan in section 2) and grows linearly with table size; the floor for a zero-hit query at 5k series is already 13ms of pure scanning. At 20k listings this becomes 50 to 100ms per keystroke of server CPU for every typing user, plus one uncancelled query per debounce window.

Keystroke-to-rendered-results on a mid-tier Android device: not measurable in this environment (no device or emulator with the app running). Derived floor from the pieces: 300ms debounce + cellular RTT (commonly 100 to 400ms) + server time above + JSON decode and render. Call it 450 to 800ms after the last keystroke on cellular today, dominated by debounce and network, not SQL, at current data size. This must be re-measured on device in the implementation phase.

Probe query result counts (search_mics against the seed, Seattle center), with what the user would actually see:

| Probe              | Rows          | Notes                                                                                    |
| ------------------ | ------------- | ---------------------------------------------------------------------------------------- |
| (empty)            | n/a           | client never sends < 2 chars; browse feed shows (server returns all 20 if called)        |
| `  ` (whitespace)  | n/a           | trimmed client-side, treated as empty. Correct today                                     |
| `open mic tonight` | 0             | contiguous-substring match; "tonight" defeats it                                         |
| `olympia`          | 2             | city match works                                                                         |
| `Olymipa`          | 0             | no typo tolerance                                                                        |
| `tuesday`          | 0             | no temporal parsing                                                                      |
| `free 21+`         | 0             | no qualifier parsing                                                                     |
| `capitol theater`  | 0             | no such venue in seed; also "capitol" alone returns 0 because neighborhood is unsearched |
| `mccrary`          | 0             | host names are not searchable at all; also no such host in seed                          |
| `zzzzzz`           | 0             | dead end: "No matches" + geocode escape only                                             |
| `café` / `cafe`    | 0 / 0         | no accented venue in seed; no unaccent either way                                        |
| location denied    | works         | home-area center + manual "Show mics near" geocode. Compliant today                      |
| rapid typing       | one final set | query-key-per-string prevents stale overwrite; no cancellation of superseded requests    |

Fixture gap: the seed contains no theater/theatre venue, no accented venue name, and no host surname worth searching (owners are "Alex Admin", "Pat Producer", "Dana Dual"). The corpus test will need seeded fixtures for `capitol theater`, `mccrary`, and `café`.

## 9. Defect list, ranked by contribution to search feeling wrong

Bugs (broken behavior):

| #   | Defect                                                                                                                                                                                                                                                             | Proposed fix                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| B1  | Trigram indexes are dead weight: the cross-table OR forces seq scans of both tables on every keystroke (plans captured); linear cost growth with catalog size                                                                                                      | Denormalized weighted tsvector + trgm on one searchable surface per series, per the target model    |
| B2  | Paused listings appear in search: `search_mics` never filters `is_active`, does not return the column, so the client cannot filter either (verified live; `mics_near` does filter it)                                                                              | Add `and s.is_active` to the WHERE                                                                  |
| B3  | "Soonest" is bucketed in the viewer's timezone: `sortSoonestNearest` derives the day with host-local getters, not the venue `timezone` the RPC already returns; two `test.failing` cases in `order.timezone.test.ts` document it                                   | Bucket by venue-local date (Intl.DateTimeFormat with the row's timezone), un-mark the failing tests |
| B4  | Day filter matches a weekday anywhere in a 14-day window while the card shows the single next occurrence: a Tue+Fri mic filtered to Friday displays Tuesday's date; same root cause drops a Tue+Fri mic from "This weekend" (documented limit in `date-window.ts`) | Resolve the next occurrence within the filtered window server-side, per the target model            |
| B5  | Series with no upcoming night still match and are not demoted: undated rows rank among dated ones (verified by cancelling a series' occurrences)                                                                                                                   | Rank on next occurrence; demote or exclude null-next rows                                           |
| B6  | Search results ignore every active filter and the radius: chips stay set, results silently stop honoring them (works as coded, but it breaks the visible contract of chips sitting under the same bar, so it reads as broken)                                      | One query path where text and filters compose                                                       |
| B7  | First tap on a search result dismisses the keyboard instead of opening the mic: the results FlatList lacks `keyboardShouldPersistTaps="handled"`                                                                                                                   | Add the prop                                                                                        |
| B8  | Search rows lost the distance display the browse cards have (UX 4 shipped "shows miles"; the unified result row renders venue, city, date only), and reuse a bespoke row instead of MicCard                                                                        | Render distance; converge on MicCard                                                                |

Design gaps (works as written, serves the user poorly):

| #   | Gap                                                                                                                                                                        | Proposed fix                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| D1  | Only title, venue name, and city are searchable: neighborhood, address, description, and host name are not ("capitol" finds nothing in Capitol Hill)                       | Weighted tsvector over all card-relevant text fields                                   |
| D2  | Whole-query contiguous substring matching: "open mic tonight" and any reordered words fail                                                                                 | websearch-style tokenized full text matching                                           |
| D3  | No typo tolerance ("Olymipa" -> 0) although pg_trgm is installed                                                                                                           | Trigram similarity second pass supplementing full text                                 |
| D4  | No accent folding (café vs cafe)                                                                                                                                           | unaccent in the text pipeline                                                          |
| D5  | No temporal or qualifier token parsing ("tonight", "tuesday", "free", "21+")                                                                                               | Small closed-set parser emitting visible chips                                         |
| D6  | Ranking has no time-to-next-occurrence, no confidence signals, and prefix-match is the only text grading                                                                   | Weighted blend (text, distance decay, time proximity, confidence) with named constants |
| D7  | Zero results is nearly a dead end: only the geocode escape is offered; nothing suggests a wider radius, wider dates, or a spelling fix; zero-result queries are not logged | Recovery ladder + zero-result logging                                                  |
| D8  | No recent searches, no saved searches                                                                                                                                      | Local persistence + named saved searches                                               |
| D9  | Hidden defaults: performer disciplines pre-seed the filter, radius default lives only in the sheet                                                                         | Visible dismissible chips for every applied constraint                                 |
| D10 | Age filter absent entirely (venues carry `age_restriction`; no UI or RPC param)                                                                                            | Add to filter set per target model                                                     |
| D11 | Map cannot search the visible region; panning never re-queries                                                                                                             | Post-rebuild candidate; out of minimum scope                                           |
| D12 | First search shows a full-screen spinner instead of skeletons; error surfaces only after ~3s of silent retries                                                             | Skeleton rows; tune retry for search                                                   |

Compliant today, worth preserving: whitespace treated as empty, no stale-overwrite (key-per-query), `keepPreviousData` while refining, virtualized FlatList, React Compiler memoization, labeled input and chips with `accessibilityState`, location on-demand with graceful manual fallback, useful empty-input browse state, offline cache with banner.

## 10. Producer role

Search is role-agnostic: the Discover search bar runs the same performer path for everyone, and producer surfaces (My Mics) list `useMySeries` with no search input at all. At realistic volume (a producer runs one to five mics) their own listings do not need a query, and nothing suggests producers use Discover search to find their own listings rather than the My Mics tab.

Recommendation: leave producer search alone. Do not add producer-specific defaults to the performer path, and do not add a search input to My Mics. If analytics later show producers with 10+ listings, a client-side filter on the My Mics list is enough. This keeps the rebuild single-purpose.

## 11. Conflicts and clarifications for the owner

1. The target model's "EXDATE and any cancellation table" maps cleanly onto what exists: there is no EXDATE storage; skipped nights are `mic_occurrences.status = 'cancelled'` rows, which the next-occurrence resolution already excludes. No schema change needed for that bullet; the occurrence table the target model would materialize already exists (90-day rolling window, idempotent generator, nightly refresh). This is good news: "resolve recurrence to occurrences at query time" is already cheap SQL against `mic_occurrences`, not RRULE math.
2. The target model says a single input searches "listing description or tags". There is no tags field on `mic_series`. Plan: include `description` in the lowest tsvector weight and skip tags unless you want a tags column added (that would be a schema addition beyond search).
3. Host/producer name search: the natural source is `public_profiles.display_name` (or stage name) of `coalesce(owner_id, created_by)`. Confirm you want people-name matching to surface listings; it is in the brief ("mccrary") so I will include it at a middle weight unless you object.
4. "Filter state persists across app backgrounding": today day-of-week picks and the Tonight/Weekend bound are deliberately session-only (yesterday's "tonight" would silently mean the wrong day). I propose keeping date-relative filters session-scoped and persisting everything else, which honors the intent of both rules.
5. The client's minimum of 2 typed characters conflicts mildly with "typing narrows an already useful list": under the target model the 0-and-1-char states should show the ranked nearby feed rather than switching modes. Planned accordingly.
6. Seed fixtures needed for the corpus (theater/theatre venue, an accented café, a host with a searchable surname); I will add them to the test path, not the production seed, unless you want the demo seed enriched too.
7. On-device keystroke-to-render could not be measured in this environment; I will instrument and report it from a device profile during implementation, before/after.

## 12. Out-of-scope defects noticed (not fixed, per the working method)

- `npm run lint` fails on this branch before any change of mine: `react-hooks/set-state-in-effect` at `src/app/auth-callback.tsx:25`. Typecheck and all 468 Jest tests pass; the local pgTAP suite passes at 387.

## 13. Proposed implementation order (awaiting approval)

1. Migration: `unaccent` extension; generated weighted tsvector on a denormalized search surface (series title, venue name A; city, neighborhood, host name B/C; description D) with GIN index; trgm similarity path; down migrations.
2. New RPC `search_discover` (existing `search_mics`/`mics_near` signatures untouched): one function serving both empty and text queries, composing all filters, resolving next occurrence in the active window, scoring with named weight constants (text, distance decay, time proximity, confidence), and returning MicCard-shaped rows. pgTAP for corpus, ranking, and the paused/deleted/cancelled exclusions.
3. Client query path: single hook for browse+search, 250ms debounce, abort-on-supersede, skeletons, keepPreviousData, keyboard fix, distance on rows, venue-local day bucketing fix (B3, un-mark test.failing).
4. Token parser (closed set) -> visible chips; chip UI consolidation so every applied constraint is a dismissible chip with count and one-tap clear.
5. Zero-result recovery ladder + zero-result logging; recent and saved searches.
6. Corpus test suite end to end, before/after metrics, SEARCH.md.

Each step lands separately with tests green. Stopping here for review.
