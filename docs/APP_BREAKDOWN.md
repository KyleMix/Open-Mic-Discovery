# Open Mic Explorer: Full App Breakdown

> **DATED SNAPSHOT, partially reconciled.** Written 2026-07-29 from the
> repo state at migration `20260728001500`. The app has moved on since:
> it was renamed Open Mic Explorer (bundle id `com.openmicexplorer.app`),
> the RevenueCat purchase layer was REMOVED (the app now sells nothing
> and ships no payment SDK), the reanimated pin moved to 4.5.1 with
> worklets 0.10.1, and the test counts grew to 554 Jest tests and 806
> pgTAP assertions as of 2026-08-11. A reconciliation pass corrected the
> name, monetization, and pin claims below, but section-level details
> (counts, migration lists, gap lists) still describe the 2026-07-29
> state. Current canonical sources: `AUDIT-REPORT.md` and
> `docs/LAUNCH-CHECKLIST.md`.

## How to use this document

This is a self-contained briefing on the entire app, written so it can be pasted into a Claude (or any AI) conversation as context. It tells you what the product is, how it is built, what rules govern changes, what is intentionally out of scope, and where the known gaps are. Section 12 contains ready-to-use prompts targeting each gap.

For deeper detail, the canonical sources in this repo are:

- `PROJECT.md`: the product brief, phase plan, and Progress Log
- `ARCHITECTURE.md`: stack choices, version pins, and the dated decisions log
- `CLAUDE.md`: session protocol and standing rules
- `REVIEW_NOTES.md`: demo credentials and a walkthrough of every non-obvious flow
- `docs/STEP0_PROPOSAL.md`: the approved schema DDL, ten scoping questions, six design flags
- `docs/COMPLIANCE.md`: Apple guideline to implementing-file map
- `docs/store/STORE_LISTING.md`: store copy and the owner submission checklist

If this document and the live code disagree, the code wins. Verify claims against the repo before acting on them.

---

## 1. What the app is

**Open Mic Explorer** (bundle id `com.openmicexplorer.app`, npm package `openmicexplorer`) is a production iOS and Android app that helps people find local open mics for **music, comedy, and poetry**, and helps the people who run those mics keep listings accurate and manage signups.

Two roles share one account (dual role is the common case in real scenes, not an edge case):

- **Performer**: discovers mics nearby, filters by discipline and format, saves favorites, gets push alerts, signs up for slots, tracks mics played.
- **Producer**: claims or creates a listing, keeps it current, manages the signup list (walk-in list, name draw, book ahead, invite only), posts the lineup, cancels individual nights.

### The four strategic pillars

1. **Freshness is the product.** The mobile incumbent died of data rot. Every listing exposes a "last confirmed" signal, and confirming is one tap for the producer. Freshness actions (create, confirm, cancel) are never paywalled.
2. **Discovery and signup are one flow.** Competitors split these across web directories and separate signup services. The wedge: go from "what is happening Tuesday near me" to "I am on the list" without leaving the app.
3. **Multi-discipline is the differentiator.** Every active competitor is single-discipline; poetry is almost entirely unserved. Music, comedy, and poetry are first-class from schema to UI, each with its own accent color.
4. **Cold start is handled by seeding.** First region (Pacific Northwest, Seattle) is seeded manually: 18 venues, 20 series across all three disciplines.

### Non-negotiable compliance gates (built, not deferred)

- **Apple Guideline 1.2 (UGC):** versioned EULA with recorded affirmative acceptance, Report on every listing and profile, Block enforced server side in the database, automated text filter (`banned_terms` + `private.text_is_clean`) before free text goes live, admin moderation queue with a documented 24-hour response target, age gating (block under 17, rate 17+).
- **Account deletion:** fully in-app, within two taps of Settings, via the `delete_account()` RPC (auth user hard-deleted, profile row anonymized because signups and lineup history reference it).
- **Privacy:** location requested only in context (map or "near me"), never background location. Sentry runs with `sendDefaultPii: false` and no user identity. Privacy manifest and Play Data Safety are living files under `docs/privacy/`.
- **Guideline 2.1 completeness:** no placeholder screens or dead links; `REVIEW_NOTES.md` carries working demo credentials and walkthroughs.

---

## 2. Current status

**All eight numbered phases (0 through 8) are complete**, followed by four named increments, all dated 2026-07-28 in the Progress Log:

- **UX**: plain-language filter rebuild, Today/Weekend quick picks, signup methods renamed (Walk-in list, Name draw, Book ahead, Invite only), profile photos, social links.
- **UX 2**: required private home area on every profile (DB-enforced, geocoded on device, never exposed through any view), personalized discovery defaults (home-centered list, own disciplines pre-selected, soonest-then-nearest sort).
- **Brand**: logo mark and wordmark on Discover, discipline accent colors threaded through tabs, chips, and badges.
- **Night**: producer on-deck megaphone (server-enforced `mark_on_deck` RPC, realtime plus push), day-of reminders fixed to the mic's timezone, add-to-calendar handoff, event posters.

**Latest state:** migration `20260728001500_on_deck_and_posters.sql`, 128 pgTAP assertions, 84 Jest cases. Working tree clean. The app is feature complete; what remains before store submission is owner-side setup only (see section 11, "Owner-gated launch checklist").

---

## 3. Tech stack and hard pins

| Layer         | Choice                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Client        | Expo SDK 57 (`~57.0.8`), React Native 0.86, React 19.2.3, TypeScript `~6.0.3` strict                         |
| Routing       | Expo Router, file-based, typed routes on, React Compiler experiment on                                       |
| Server state  | TanStack Query v5 (all Supabase data lives here)                                                             |
| Client state  | Zustand v5 (UI-only state; server data never enters Zustand)                                                 |
| Backend       | Supabase: Postgres 17 + PostGIS, Auth, Storage, Realtime, Edge Functions                                     |
| Maps          | react-native-maps 1.27.2 with supercluster clustering (in-house component, not the unmaintained wrapper lib) |
| Location      | expo-location, foreground only, requested in context                                                         |
| Notifications | expo-notifications + Expo Push, driven by a database outbox                                                  |
| Payments      | None. In-app purchases were removed; the app sells nothing and ships no payment SDK                          |
| Errors        | Sentry via `@sentry/react-native`, inert without a DSN                                                       |
| Build/ship    | EAS Build, Submit, Update (development, preview, production channels)                                        |
| Tests         | Jest + jest-expo + React Native Testing Library; pgTAP for the database; Maestro YAML for e2e                |

### Pins that must move together (do not violate)

- `react-native-reanimated 4.5.1` + `react-native-worklets 0.10.1`: upgrade both at once or neither, only to an Expo-documented SDK-compatible pairing. RN 0.82+ removed the legacy architecture, so New Architecture with Reanimated 4 is the only option on this stack.
- All `expo-*` packages upgrade only via `npx expo install`.
- TypeScript stays at `~6.0.3` (the SDK 57 template pin). Do not jump to TypeScript 7 until the Expo toolchain adopts it.
- Paid slots must never use IAP: paying for a slot at a real-world open mic is a real-world service under Apple 3.1.5(a) and would use an external processor if payment handling ever lands. (v1 ships no payments at all; the RevenueCat layer this rule once referenced was removed.)

---

## 4. Repo map

```
Open-Mic-Discovery/
├── src/app/          Expo Router routes only (thin: routing + composition)
│   ├── (auth)/       sign-in, sign-up, eula, onboarding
│   ├── (tabs)/       index (Discover), favorites, producer (My Mics), profile
│   ├── mic/[id]      public mic detail
│   ├── producer/     new, [id] manage, night/[occurrenceId] roster, analytics/[id]
│   ├── admin, settings, notification-prefs, edit-profile
├── src/components/   shared primitives (ui.tsx, glyph.tsx, logo.tsx)
├── src/features/     feature modules: auth, discovery, producer, signups,
│                     favorites, profile, safety, notifications, calendar
├── src/lib/          supabase client, query client, env, sentry, notifications
├── src/stores/       Zustand stores (filters.ts, onboarding.ts)
├── src/theme/        tokens.ts (single source of truth for color/spacing/type)
├── src/types/        generated database.types.ts (regenerate via npm run db:types)
├── supabase/         16 migrations, 10 pgTAP suites, seed.sql, config.toml,
│                     functions/push-sender (the only edge function)
├── e2e/              Maestro flows: discovery.yaml, signup.yaml (not wired to CI)
├── scripts/db/       verify-local.sh + shim-supabase.sql (Docker-free DB verify)
└── docs/             STEP0_PROPOSAL, COMPLIANCE, ASSET_PROMPTS, privacy/, store/
```

Rule: screens are thin. `src/app/` only routes and composes; real UI and logic live in `src/components` and `src/features/<feature>/` so they are testable without the router.

---

## 5. Backend and data model

### Tables (18 total, built across 16 migrations `20260728000100` to `20260728001500`)

**Identity:** `profiles` (PK = auth user id; `handle` citext unique `^[a-z0-9_]{3,30}$`, display name, avatar, bio, role booleans `is_performer`/`is_producer`/`is_admin`, `eula_version`, `moderation_status`, soft-delete `deleted_at`, private home area columns including PostGIS `home_location`, four social link columns with regex checks). 1:1 extensions: `performer_profiles` (disciplines, experience, links, tags) and `producer_profiles` (contact_email, contact_phone, payout_ref, verified). `eula_versions` stores the actual EULA texts so acceptance is provable.

**Listings:** `venues` (address, PostGIS location, accessibility tri-states, moderation, soft-delete) and `mic_series` (venue, `created_by` who entered it, `owner_id` controlling producer or null until claimed, disciplines, recurrence fields, signup method and windows, cost, capacity, `is_active`, `last_confirmed_at/by`, `poster_url`, moderation, soft-delete). `claim_requests` models the admin-reviewed claim workflow (one pending claim per series per requester).

**Scheduling:** `mic_occurrences` (series, `local_date`, computed `starts_at timestamptz`, `doors_at`, status, per-night overrides: title, cost, venue, cancellation note). **Unique on `(series_id, local_date)`**, the idempotency key.

**Participation:** `signups` (occurrence, performer, status, `slot_position`, `on_deck_at`, unique per occurrence+performer), `favorites`, `attendance_log` (self-reported performer history only, never producer-facing).

**Safety and ops:** `blocks`, `reports` (polymorphic target), `listing_flags`, `banned_terms`, `device_push_tokens`, `notification_prefs`, `notification_outbox` (RLS on with zero policies: service-role only).

### Recurrence model (a deliberate deviation from plain RRULE, documented in migration 000300)

`mic_series.rrule` carries only the date pattern (`FREQ`/`INTERVAL`/`BYDAY`). Local wall-clock time lives in `start_time`, doors in `doors_offset`, and `anchor_date` fixes biweekly parity. `starts_at` is computed as `(local_date + start_time) at time zone series.timezone` (an IANA name, validated by trigger against `pg_timezone_names`), which makes DST handling correct by construction. Supported: `FREQ=WEEKLY` with any `INTERVAL` and multiple `BYDAY`, and `FREQ=MONTHLY` with ordinal `BYDAY` (`1TU`, `3TU`, `-1FR`).

### Occurrence generation

- `private.generate_occurrences(series_id, horizon_days default 90)`: walks each active series day by day and inserts with `ON CONFLICT (series_id, local_date) DO NOTHING`. Idempotent; never duplicates a night or clobbers a cancellation, override, or a night with signups.
- `private.reconcile_future_occurrences()`: the "this and all future" path. Deletes future untouched scheduled nights that no longer match the rule, recomputes times for the rest, tops up. Fires from a trigger on series insert or on update of recurrence columns, `is_active`, or `deleted_at`.
- Nightly top-up via pg_cron at 09:17 UTC, wrapped so environments without pg_cron still migrate.
- "This night only" edits write override columns on the occurrence. Listings are soft-deleted only.

### RLS strategy

- RLS is enabled on every public table. Grants are deliberately broad (migration 001200); all enforcement lives in policies, triggers, and views.
- Pattern: owner-scoped `using (x = (select auth.uid()))`, an admin escape hatch via `private.is_admin()` (SECURITY DEFINER, avoids recursion), and public anonymous read on `venues`/`mic_series`/`mic_occurrences` gated on `deleted_at is null and moderation_status = 'approved'` (anonymous browsing is a product decision; an account is required only to favorite, sign up, flag, or produce).
- **Column hiding is done with views, not RLS.** `profiles` and `producer_profiles` deny non-owner selects at the base table and expose `public_profiles`, `performer_public`, `producer_public` (all `security_invoker = off`) with block filtering built in. `contact_phone`, `payout_ref`, `birth_year`, and every home-area column never appear in any view (pgTAP-verified).
- **Privilege escalation is stopped by BEFORE triggers, not policies:** `is_admin`, `verified`, `moderation_status`, `eula_accepted_at`, `last_confirmed_*`, and signup `status`/`slot_position` are pinned or server-stamped for non-admins. Rationale recorded in migration 000900: `WITH CHECK` sees the post-trigger row, so initial-status assertions live in triggers.
- Blocks are bidirectional, enforced via SECURITY DEFINER helpers `private.is_blocked_pair()` and `private.is_blocked_by_producer()`. Scope (flag F3, approved): blocking a producer hides their profile and free text, not the mic listing itself.
- No DELETE policies on `profiles`, `venues`, `mic_series`: soft-delete only.
- Storage: public-read `avatars` and `posters` buckets where writes are scoped to the uploader's own folder (`(storage.foldername(name))[1] = auth.uid()::text`).

### RPCs and the edge function

Business logic lives in SQL, not the client: `mics_near` (ST_DWithin radius + KNN ordering, all filters server side, SECURITY INVOKER so RLS applies to anonymous discovery), `search_mics`, `draw_lottery`, `set_slot_order`, `mark_on_deck`, `review_claim`, `moderate_content`, `delete_account`. The client never does distance math.

Notifications use an outbox pattern: DB triggers and three pg_cron queue jobs (favorite reminders hourly, new-mic alerts every 4 hours, weekly digest Monday 17:00) write to `notification_outbox`; the single edge function `supabase/functions/push-sender/index.ts` drains it in batches of 100 through the Expo push API under the service role.

---

## 6. Client architecture and conventions

### App shell and auth flow

`src/app/_layout.tsx` wraps everything in `PersistQueryClientProvider` (AsyncStorage persister, 24 h maxAge, giving offline reads), then `SessionProvider`, theme, and `AuthGate`. AuthGate routes: no session goes to sign-in; session without profile goes to EULA then onboarding; stale EULA version goes back to EULA; otherwise the four tabs. Onboarding collects handle, display name, required private home area (city/state or ZIP, geocoded on device), birth year (17+ gate), and roles.

### Screens

Four tabs: **Discover** (search, locate, map/list toggle, filter bar, `mics_near`/`search_mics` results sorted soonest-then-nearest), **Favorites**, **My Mics** (producer dashboard, one-tap confirm, admin claim queue), **Profile**. Stack routes: `mic/[id]` (detail with freshness badge, signup card, favorite, directions, calendar, report, flag), `producer/new` and `producer/[id]` (SeriesForm with a non-technical recurrence builder), `producer/night/[occurrenceId]` (live roster: visible lottery shuffle, up/down reorder, performed/no-show, on-deck megaphone, Realtime-synced), `producer/analytics/[id]`, `settings` (including typed-confirmation account deletion), `notification-prefs`, `edit-profile`, `admin` (moderation queue).

### Patterns to follow when writing code here

- **Data fetching:** every feature has a `queries.ts` exporting `useX` hooks built on TanStack Query. Shape: destructure `{ data, error }` from Supabase, throw on error, return data. Mutations invalidate by key prefix (`['mics']`, `['producer']`, `['signup']`, `['favorites']`, `['moderation']`). The roster hook layers a Supabase Realtime `postgres_changes` subscription that invalidates on change.
- **Supabase client:** lazy singleton `getSupabase()` in `src/lib/supabase.ts`, typed with the generated `Database`, PKCE flow, AsyncStorage sessions. Never constructed at module import time (so tests never throw on import).
- **Forms:** no form library. `useState` per field plus pure validator functions returning `string | null`, rendered inline by the shared `Field` component. Submit handlers are try/catch/finally with a local `busy` flag.
- **Styling:** `StyleSheet.create` plus tokens from `src/theme/tokens.ts` only. Dark-first (`userInterfaceStyle: "dark"`), discipline accents (music blue `#4DA6FF`, comedy amber `#FFB84D`, poetry purple `#C084FC`), Poppins type scale, `minTouchTarget = 44`. Accent contrast is unit-tested in `tokens.test.ts`.
- **State ladder:** every screen explicitly handles the four states in order: `isPending` renders `LoadingView`, `isError` renders `ErrorText` plus a "Try again" button wired to refetch, empty data renders a titled empty state with a useful next action, then success. `src/app/(tabs)/index.tsx` is the canonical example.
- **Platform splits** use file extensions (`mic-map.tsx` vs `mic-map.web.tsx`), not runtime checks.
- **Accessibility:** shared primitives in `src/components/ui.tsx` carry `accessibilityRole`/`accessibilityLabel`/`accessibilityState`; keep that when adding components.
- **Monetization boundaries:** none remain in code. The entitlement layer (`src/features/pro/`) and paywall route were removed with the purchase SDK; every feature is free to every account.

---

## 7. Testing and quality gates

- **Jest (84 cases, 14 files):** colocated `*.test.ts(x)`, almost entirely pure-function tests: social link normalization, home-area validation, filter store and RPC arg mapping, signup window parsing, RRULE build/parse and plain-English rendering, auth validation and age gate, distance and sort helpers, token contrast, entitlement fail-closed, one component render smoke test.
- **pgTAP (128 assertions, 10 suites):** RLS on every table with anon and wrong-user denials, occurrence generation across the November 2026 DST fall-back (20:00 local stays 20:00 local), idempotency, signup lifecycle, producer guards, moderation, home-area leak checks, retention queues, on-deck and posters.
- **Maestro e2e:** `e2e/discovery.yaml` and `e2e/signup.yaml`, using seeded demo accounts. Not wired to any runner.
- **Database verification without Docker:** `scripts/db/verify-local.sh` rebuilds a scratch database on system Postgres, applies `scripts/db/shim-supabase.sql` (fakes API roles, auth schema, `auth.uid()`), runs all migrations plus seed, then `pg_prove`. The shim is a local harness only, never applied to a real Supabase project. With Docker available, `supabase test db` is canonical, and `npm run db:types` regenerates `src/types/database.types.ts` after any migration change.
- **Gate before any commit:** `npm run typecheck`, `npm run lint`, `npm test`. There is no CI; this gate is currently manual (see section 11).

---

## 8. Standing rules any prompt must respect

1. Work only within the current phase or the explicitly requested task. Stop at the end, summarize, update the Progress Log in `PROJECT.md`, and wait for review.
2. No em dashes in any user-facing copy, error message, or documentation.
3. TypeScript strict, no `any` (lint-enforced). Screens handle loading, empty, error, and success explicitly.
4. Every table ships with RLS policies and a pgTAP test in the same migration commit.
5. Never store naive local times: `timestamptz` plus the IANA timezone on the series, never a UTC offset.
6. Soft-delete listings. Occurrence generation stays idempotent on `(series_id, local_date)`.
7. Write tests alongside features, not after.
8. Expo SDK 57: consult https://docs.expo.dev/versions/v57.0.0/ for current APIs; upgrade expo packages only via `npx expo install`.
9. Reanimated 4.5.0 and react-native-worklets 0.10.0 move together or not at all.
10. `npm run typecheck`, `npm run lint`, and `npm test` must pass before any commit.
11. Do not commit secrets: EAS secrets and Supabase environment config only.
12. If a requirement conflicts with an App Store guideline, the guideline wins; surface the conflict.
13. Empty states must be genuinely useful (in an empty city, invite the user to add the first mic). Offline reads must keep working from cache.
14. If a decision would be expensive to reverse, stop and ask the owner first.

---

## 9. Explicitly out of scope for v1

Do not build these, and push back if asked without new justification:

- Joke bank, setlist builder, on-stage timer, performance recorder (saturated category, not this product).
- Social feed, DMs, follower graph (each multiplies the Apple moderation burden).
- AI features.
- Comments and reviews (the report schema supports adding target types later).
- In-app "request a spot" for book-ahead mics (display-only contact route; an inbox is a DM system in disguise).
- Scheduled or automatic lottery draw (manual producer-triggered only).
- Automated claim verification (admin-reviewed queue only).
- Automatic waitlist promotion (producer-controlled one-tap promote).
- International or non-USD (US-only v1; `country` fields exist so expansion is a data change).
- IAP for paid slots (prohibited by Apple 3.1.5(a); external processor when it lands).

---

## 10. Deliberate deviations already made (do not "fix" these as bugs)

- Up/down reorder controls instead of drag-to-reorder: maintained drag-list libraries predate Reanimated 4 and the New Architecture. `set_slot_order` already accepts an arbitrary full ordering, so only the gesture layer changes later.
- `rrule` stores the date pattern only, with time and anchor in separate columns (see section 5).
- Blocking a producer does not hide their mic listings, only their profile and free text (flag F3, approved).
- The `profiles` to `auth.users` foreign key was deliberately dropped (migration 001000) so anonymized profiles outlive deleted auth users.
- New listings default to `America/Los_Angeles`; timezone selection is planned before multi-region expansion.
- `attendance_log` is intentionally separate from `signups`: personal self-reported history only.

---

## 11. Known gaps and improvement opportunities

Roughly prioritized. These are the places where improvement prompts will pay off.

### Security and hygiene

- **Committed personal credentials:** `supabase/seed.sql` contains a personal tester account (a real email address) with a plaintext password, alongside the demo accounts. Fine for local seeding in spirit, but real emails and reusable passwords should not live in git history, and this seed must never reach the hosted project as is.
- **Weak edge function auth:** `push-sender` authorizes with `authHeader.endsWith(serviceKey)`, which is not a proper comparison of a bearer token (and not constant-time). It should verify the JWT or compare the full expected header value.
- **Migration ordering quirk:** `20260728001200_grants.sql` describes itself as the trailing catch-all for grants, but its timestamp sorts it before `001300` to `001500`. It currently works because of the default-privileges clause, but the next engineer to add a migration could be bitten. Renaming or documenting the invariant would remove the trap.

### Process

- **No CI at all.** There is no `.github/` directory. The typecheck/lint/test gate and the pgTAP suite run only when someone remembers to run them. A GitHub Actions workflow running `npm run typecheck`, `npm run lint`, `npm test`, and the database suite (via `supabase test db` in a service container, or `verify-local.sh` against a Postgres service) would enforce the project's own stated gate.
- **Commit message quality** degraded late in the project ("commet", "yeppers", "yeah"). Cosmetic, but worth a convention going forward.
- **Stale documentation counts:** `REVIEW_NOTES.md` says 99 pgTAP and `PROJECT.md`'s log rows say 111/120 in places; the actual current totals are 128 pgTAP and 84 Jest. The Progress Log is also not in chronological order.

### Test gaps

- **No screen or integration tests.** Nothing under `src/app/` is tested; the 84 Jest cases are almost entirely pure functions. There is no query-hook testing setup (no Supabase mock, no QueryClient test wrapper, no MSW). The explicit loading/error/empty/success ladder is a stated project rule but is untested.
- **Maestro flows are not wired to any runner**, so the two e2e YAML files only run manually.

### Deferred product and platform items

- Apple and Google sign-in are coded but need provider credentials configured in Supabase Auth.
- Timezone picker on the listing form (currently defaults to `America/Los_Angeles`).
- Drag-to-reorder gesture layer, when a New Architecture compatible library stabilizes.
- Scheduled auto lottery draw and auto waitlist promotion are designed-for but deliberately v2.

### Asset debt (prompt pack ready in `docs/ASSET_PROMPTS.md`)

Delivered: the 10-glyph UI set. Still undelivered: app icon, Android adaptive icon (foreground + monochrome), splash icon, notification small icon, map markers (4 discipline pins, stale pin, cluster bubble), 5 empty-state illustrations, 2 role-card illustrations, store screenshots.

### Owner-gated launch checklist (from `docs/store/STORE_LISTING.md`)

Apple Developer and Play Console accounts; hosted Supabase project (`supabase db push`, deploy the Edge Functions, production demo accounts, replace seed credentials in REVIEW_NOTES); EAS env vars (Supabase URL and anon key, Sentry DSN; no RevenueCat keys, purchases were removed); Google Maps API key for Android; Sign in with Apple and Google OAuth configured; final art; production builds; TestFlight and Play internal testing; `eas submit`. The current version of this list is `docs/LAUNCH-CHECKLIST.md`.

---

## 12. Ready-to-use improvement prompts

Each prompt is written to stand alone in a fresh Claude session on this repo. Paste one, optionally with this whole document above it.

### P1: Add CI

> Read CLAUDE.md, PROJECT.md, and ARCHITECTURE.md first. Add GitHub Actions CI to this repo. Requirements: one workflow that runs on pull requests and pushes to main, with jobs for `npm run typecheck`, `npm run lint`, and `npm test`, plus a database job that runs the full migration chain, seed, and pgTAP suite against a Postgres 17 + PostGIS service container (adapt `scripts/db/verify-local.sh` and `scripts/db/shim-supabase.sql`, or use `supabase test db` if Docker-in-Docker is viable). Cache npm. Do not change any application code. No em dashes in any docs you touch.

### P2: Remove committed personal credentials

> In `supabase/seed.sql` there is a personal tester account with a real email address and a plaintext password, in addition to the `@demo.openmic.local` demo accounts. Remove the personal account from the seed, replace any references to it in REVIEW_NOTES.md with a demo account, and document in the seed header that personal test accounts belong in a local-only untracked seed overlay. Note in your summary that the password should be considered burned and rotated, and that git history still contains it (recommend whether history rewriting is worth it before the repo is shared). Run the pgTAP suite afterward to confirm the seed still loads.

### P3: Harden the push-sender edge function

> Read `supabase/functions/push-sender/index.ts`. Its auth check is `authHeader.endsWith(serviceKey)`. Replace it with a proper check: require `Authorization: Bearer <token>` and compare the token to the service role key with a timing-safe comparison, or verify it as a JWT with role `service_role`. Also add basic failure handling around the Expo push call (do not stamp `sent_at` on rows whose batch failed). Keep the function dependency-free Deno. Update REVIEW_NOTES.md if the invocation instructions change.

### P4: Screen-level tests for the state ladder

> This project's rule is that every screen explicitly handles loading, error, empty, and success. None of that is currently tested; the 84 Jest cases are pure functions. Build the missing test infrastructure: a test QueryClient wrapper with retries off, a lightweight mock of `getSupabase()` (see `src/lib/supabase.ts`, it is a lazy singleton, which makes injection straightforward), and render tests with React Native Testing Library. Start with the Discover screen (`src/app/(tabs)/index.tsx`) and the mic detail screen (`src/app/mic/[id].tsx`): assert all four states render, and that error states show a working retry. Follow the existing colocated `*.test.tsx` convention, jest-expo preset, TypeScript strict, no `any`.

### P5: Fix the migration ordering trap

> `supabase/migrations/20260728001200_grants.sql` is written as a trailing catch-all for role grants, but three later migrations (001300, 001400, 001500) sort after it and rely on its default-privileges clause. Without changing any deployed behavior, make this safe for future migrations: either add a new trailing grants migration with a timestamp after 001500 that re-asserts the catch-all grants, or document the invariant prominently in 001200's header and in ARCHITECTURE.md. Prove no behavior change by running the full migration chain and pgTAP suite via `scripts/db/verify-local.sh`.

### P6: Sync stale docs

> Reconcile the documentation with reality: REVIEW_NOTES.md and PROJECT.md quote stale test counts (actual totals are 128 pgTAP assertions and 84 Jest cases; verify by counting before writing). Put the PROJECT.md Progress Log rows in chronological order without losing any content. Check REVIEW_NOTES.md walkthroughs still match the current screens. Docs only, no code changes, no em dashes.

### P7: Wire up Maestro e2e

> `e2e/discovery.yaml` and `e2e/signup.yaml` are Maestro flows using the seeded demo accounts, currently run by hand. Document a repeatable local run (Maestro CLI + iOS simulator or Android emulator against `npm run start` and a seeded local Supabase), fix anything in the flows that has drifted from the current UI (filters were renamed to plain language: Walk-in list, Name draw, Book ahead, Invite only), and add a third flow covering the producer confirm-listing tap, since freshness is the core product loop.

### P8: Timezone picker on the listing form

> Series creation (`src/app/producer/new.tsx` and the SeriesForm in `src/features/producer/`) hardcodes `America/Los_Angeles`. Add a timezone selector: default from the venue's location or the device timezone, offer a curated US IANA list first with search for the rest, store only IANA names (the DB trigger `private.validate_series_timezone` already rejects invalid ones). Plain-language labels like "Pacific Time" with the IANA name as detail. Follow the existing form pattern (useState per field, pure validators, `Field` component), add validator tests, keep TypeScript strict.

### P9: Accessibility audit pass

> The brief requires labeled touch targets, dynamic type, and VoiceOver/TalkBack testing on at least discovery and signup. Audit `src/app/(tabs)/index.tsx`, `src/app/mic/[id].tsx`, and the signup card in `src/features/signups/` against that bar: every touchable has a role and label, hit targets meet `minTouchTarget = 44` from `src/theme/tokens.ts`, text scales without truncation at large dynamic type, and state changes (favorite toggled, signup confirmed) are announced. Fix what you find, and add the checks you can automate as Jest tests on the shared primitives in `src/components/ui.tsx`.

### P10: Commit and PR conventions

> Add a short CONTRIBUTING.md defining commit message conventions (imperative subject, what changed and why, reference the phase or work stream) and a PR checklist mirroring the CLAUDE.md gate (typecheck, lint, test, pgTAP for any migration). Wire a commit-msg hook or CI check if lightweight. Recent history includes messages like "yeppers" and "yeah"; the goal is that the log reads as a change narrative again. No em dashes.

### P11: Query-hook tests for the realtime roster

> `src/features/signups/queries.ts` contains the roster hook that combines a TanStack Query fetch with a Supabase Realtime `postgres_changes` subscription that invalidates on change. This is the most intricate client data path in the app and is untested. Using the mock strategy from the screen-test infrastructure (or building it if absent), add tests that: the subscription is created and torn down with the hook lifecycle, an incoming change event invalidates the roster query key, and lottery draw / reorder / on-deck mutations invalidate as expected. No `any`, colocated test file.

### P12: Pre-submission compliance sweep

> Read docs/COMPLIANCE.md, docs/privacy/APPLE_PRIVACY.md, docs/privacy/PLAY_DATA_SAFETY.md, and docs/store/STORE_LISTING.md. Verify each claimed guideline mapping still points at real, current code (files move; claims rot). Confirm: account deletion is reachable in two taps from Settings, the EULA re-acceptance gate triggers on version bump, location permission copy matches the in-context request, and REVIEW_NOTES.md credentials will exist on the hosted project. (There is no paywall and no Restore Purchases button to check: the app sells nothing.) Produce a gap list ordered by rejection risk; fix only doc-level gaps, and list code gaps for review instead of changing behavior.

---

_Generated 2026-07-29 from the repo state at migration `20260728001500`, 128 pgTAP assertions, 84 Jest cases._
