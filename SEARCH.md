# Search: how it works and how to tune it

Last updated 2026-08-07, with the search rebuild (migrations 20260807000200 and 20260807000300). The diagnosis that motivated all of this is docs/SEARCH_PHASE0.md.

## The one-sentence model

Browsing and searching are the same query: `search_discover` returns mics ranked by a weighted blend of text relevance, distance decay, time until the next night, and listing confidence, and an empty query simply drops the text term so proximity and soonness decide.

## The three layers

### 1. The search surface: `series_search`

One row per publicly visible listing, kept in step by triggers on `mic_series`, `venues`, and `profiles` (all routed through `private.build_series_search`, the single definition of what is searchable):

- `document`: a weighted tsvector. Weight A: mic title, venue name. B: city, neighborhood, host stage name. C: street address, region. D: description. Everything passes through `private.unaccent_imm`, so Café and Cafe are the same word. The host name is `stage_name`, the public identity; the private `display_name` is never indexed (asserted in pgTAP).
- `fuzzy`: the unaccented plain concatenation of title, venue, city, neighborhood, and host, for trigram similarity.

Row presence IS the visibility rule: the builder only stores a row when the series and its venue are both approved and not deleted, and deletes it otherwise, so the RLS policy is `using (true)`. That is deliberate and load-bearing: tsquery and trigram operators are not leakproof, so any row-condition policy forbids them as index conditions and every search becomes a sequential scan (measured: a zero-hit query went from under 1ms to 180ms at 5,020 documents). If you ever need a conditional policy here, benchmark first.

To make a new field searchable: add it to `private.build_series_search` (one place), pick a weight, add a trigger event if a new column feeds it, backfill with `select private.build_series_search(id) from mic_series;`, and add a corpus assertion.

### 2. The RPC: `search_discover`

SECURITY INVOKER plpgsql, in `supabase/migrations/20260807000300_search_discover.sql`. Two arms inside one statement, gated by one-time filters, because they need different driving indexes: browse drives from the venue GiST radius index, text drives from the two GIN indexes on the surface. Two phases: a narrow scoring pass over all candidates, then card enrichment (including the spots-left count) for only the rows that survive the limit.

Text matching is full text first (all words required, last word as a prefix so typing feels incremental), with a trigram `word_similarity` pass that only runs when full text found fewer than `FUZZY_WHEN_UNDER` rows. Fuzzy supplements, never replaces: its text score is capped below the full text floor, and rows carry `match_kind` ('text' | 'fuzzy' | 'browse') so the client can say "showing close matches".

Occurrences: each row carries the series' next occurrence that satisfies the temporal filters, resolved against `mic_occurrences` (cancelled nights excluded). Date windows compare `local_date`, the venue-local calendar day, so tonight means tonight where the venue is. Day filters change which occurrence a card shows: a Tue+Fri mic filtered to Friday shows its Friday. A mic still counts as next for `START_GRACE` (60 minutes) after it starts, because the person in the parking lot at 8:30 still cares about the 8:00 mic.

### 3. The client

`useDiscoverFeed` (src/features/discovery/queries.ts) serves the Discover screen for both states. 250ms debounce; each (filters, center, query) tuple is its own TanStack Query cache key, so a stale response can never overwrite a newer one; the abort signal is threaded to the fetch so superseded requests are cancelled. A closed-set token parser (src/features/discovery/query-tokens.ts) turns "open mic tonight" into the query "open mic" plus the same Tonight chip a tap would set. Zero results trigger `useSearchRecovery`, which probes one radius step up and then the same search without its date filter, and the screen offers those, the feed without the query, a place-name recenter, and clear-all, in that order. Every zero-result query is logged through `logZeroResultSearch` (inert without a Sentry DSN); that log is a list of what people wanted and could not find.

## The ranking model

Every constant lives in the DECLARE block of `search_discover`. The score of a row is:

```
score = W_TEXT * text + W_DIST * dist + W_TIME * time + W_CONF * conf
```

with every component in 0..1:

| Constant | Value | Meaning |
|---|---|---|
| `W_TEXT` | 4.0 | Text relevance. Zero while browsing. Full text: `TEXT_FLOOR + (1 - TEXT_FLOOR) * ts_rank_cd(document, query, 32)`. Fuzzy: `FUZZY_CEILING * word_similarity`. |
| `W_DIST` | 2.0 | Distance decay `0.5 ^ (meters / DIST_HALF_M)`. Neutral 0.5 with no location. |
| `W_TIME` | 2.5 | Time decay `0.5 ^ (hours_until_start / TIME_HALF_H)`. Zero with no upcoming night, which is what sinks undated listings. |
| `W_CONF` | 1.0 | `0.7 * freshness + 0.3 * verified`. Freshness uses the badge tiers: confirmed within 14 days scores 1.0, within 45 days 0.5, else 0. |
| `TEXT_FLOOR` | 0.60 | Guarantees any full text match outranks any fuzzy match on the text component (fuzzy caps at `FUZZY_CEILING` = 0.50). |
| `DIST_HALF_M` | 15000 | About 9 miles. At 3 miles dist is about 0.8, at 12 miles about 0.4: a strong match 12 miles out beats a weak match at 3. |
| `TIME_HALF_H` | 72 | A mic in 2 hours scores about 0.98, in 9 days about 0.13. |
| `START_GRACE` | 60 min | How long after start a night still counts as next. |
| `FUZZY_WHEN_UNDER` | 5 | Run the fuzzy pass only when full text found fewer rows than this. |

Tie-breaks after the score: sooner night, then nearer, then title.

### Tuning by complaint

- "Search ignores what I typed": raise `W_TEXT`, or lower `DIST_HALF_M` if far-away exact matches are the issue.
- "Everything is next week": raise `W_TIME` or lower `TIME_HALF_H`.
- "It keeps showing mics an hour away": lower `DIST_HALF_M` (halving distance decays faster) or raise `W_DIST`.
- "Typos stop matching" / "typos match garbage": the threshold is `pg_trgm.word_similarity_threshold = 0.4`, set on `private.search_fuzzy_hits`. Measured calibration: a one-letter transposition scores about 0.5 against the right document; unrelated documents score 0.08 to 0.2. Move it in 0.05 steps and re-run the corpus suite.
- "Stale listings rank too high/low": adjust `W_CONF` or the 0.7/0.3 split inside it.

After any change: `bash scripts/db/verify-local.sh` (the pgTAP corpus in supabase/tests/search-discover.test.sql asserts the ranking invariants, including that text always outranks fuzzy).

### Three deliberate performance decisions

Each is documented at its site with the measurement; do not undo them casually:

1. plpgsql, not sql: SQL functions carrying SET clauses replan on every call, and this body is expensive to plan.
2. `set plan_cache_mode = force_generic_plan` on `search_discover`: under anonymous RLS the parameter-inlined custom plan was 14x slower than the generic one (1.4s vs 99ms at 5,020 series).
3. `set enable_seqscan = off` scoped inside `private.search_fuzzy_hits`: the GIN trigram cost estimate loses to a sequential scan the index beats by 14x (4ms vs 57ms).

## Metrics, before and after

Server-side, measured in this container (Postgres 16), function body percentiles over 30 runs. "Old" is `search_mics`/`mics_near`; both old and new measured as the anon role with RLS applied, on the same synthetic dataset (5,020 series, 3,018 venues, 65,203 occurrences packed into one metro area, which is far denser than any launch city).

| Query | Old p50 / p95 | New p50 / p95 | Notes |
|---|---|---|---|
| Browse, 40 km radius | 105.9 / 122.9 ms | 102.1 / 116.7 ms | new adds the full blend, old was a plain sort |
| "open mic" (about 2,000 matches) | 105.7 / 120.5 ms | 109.8 / 128.7 ms | equal cost, but filters now compose |
| "olympia" | 55.9 / 59.4 ms | 45.0 / 51.6 ms | |
| "Olymipa" (typo) | n/a (0 results) | 62.3 / 68.6 ms | old returned nothing at any speed |
| "zzzzzz" (zero hits) | 14.6 / 15.5 ms | 0.5 / 0.6 ms | GIN miss vs full scans |
| Tonight window, browse | n/a | 53.1 / 57.1 ms | old had no server date windows |

At seed scale (20 series) everything is under 2ms. Keystroke-to-render on a mid-tier Android device could not be measured in this environment; the floor is 250ms debounce + cellular RTT + the numbers above. Measure on device before store submission and record it here.

Corpus outcomes (seed data plus test fixtures; automated in supabase/tests/search-discover.test.sql and src/features/discovery/discover-screen.test.tsx):

| Query | Result |
|---|---|
| (empty) | 20 rows, nearby soonest-first blend |
| `open mic tonight` | client parses to "open mic" + Tonight chip; 4 matches, proximity ranked |
| `olympia` | 2 city matches (3 with the Capitol Theatre fixture) |
| `Olymipa` | same mics via the fuzzy pass, labeled "showing close matches" |
| `tuesday` | Tuesday chip applied, occurrences resolved to Tuesdays |
| `free 21+` | two chips, no text query left |
| `capitol theater` | finds Capitol Theatre through the fuzzy pass |
| `mccrary` | host stage-name match |
| `zzzzzz` | zero rows; recovery ladder offers wider radius, nearby feed, recenter |
| `  ` | treated as browsing |
| `café` / `cafe` | both match Café Río |
| location denied | home-area center, manual place recenter, fully usable |
| rapid 10-char typing | exactly one settled request (asserted in the screen test) |

## Operational notes

- Migrations 20260807000200 and 20260807000300 have checked-in down migrations under `supabase/migrations/down/` (outside the CLI glob; apply by hand to roll back).
- The old `mics_near` and `search_mics` RPCs still exist untouched; nothing in the app calls them anymore, but external callers would not break. Consider retiring them in a later migration once nothing depends on them.
- Regenerate client types after schema changes: `node scripts/dev/gen-types.mjs`, then `npx prettier --write src/types/database.types.ts`.
- Producer search: deliberately unchanged. My Mics lists a producer's own series without a query; the Discover search stays role-agnostic.
