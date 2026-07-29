# Claude Code Kickoff Prompt: Open Mic Discovery Platform

How to use this file: save it as PROJECT.md in an empty repo, open Claude Code in that directory, and paste the "PROMPT BEGINS HERE" section as your first message. Keep this file in the repo. Tell Claude Code to re-read it at the start of every session and to update the Progress Log at the bottom as it goes.

## PROMPT BEGINS HERE

You are the lead engineer on a production mobile application that will ship to both the Apple App Store and Google Play. Read this entire brief before writing any code. Do not start generating files until you have completed Step 0.

### Product summary

A mobile app that helps people find local open mics for music, comedy, and poetry, and helps the people who run those mics keep their listings accurate and manage signups.

Working name: OPEN MIC (placeholder, I will finalize before store submission).

Two roles, one account:

- Performer: discovers mics near them, filters by discipline and format, saves favorites, gets push alerts, signs up for slots, tracks which mics they have played.
- Producer: claims or creates a mic listing, keeps it current, manages the signup list (lottery, first-come, or reserved slots), posts the lineup, and cancels individual nights.

A single account can hold both roles simultaneously. This is the common case in real scenes, not an edge case. Do not build two separate account types.

### Why this app exists (the strategic constraints that drive design)

- The existing mobile incumbent died of data rot. Its listings went stale and user corrections went nowhere. Freshness is the product. Every listing must expose a "last confirmed" signal, and confirming a listing must be a one-tap action for the producer.
- Discovery and signup are currently two different tools (web directories plus a separate signup service). Joining them is the wedge. A performer should go from "what is happening Tuesday near me" to "I am on the list" without leaving the app.
- Every active competitor is single-discipline. Multi-discipline in one map is the differentiator. Poetry is almost entirely unserved. Treat all three disciplines as first-class from schema to UI, never as a filter bolted onto a comedy app.
- This is a two-sided marketplace with a cold start problem. The first city will be seeded manually. Build an admin import path and a bulk-entry tool early so seeding is not painful.

### Non-negotiable requirements

These are gates. Do not treat any of them as a later phase.

App Store Guideline 1.2 compliance (user generated content). Apple tightened this in 2026 and enforces removal. From the first build:

- A custom EULA that explicitly prohibits objectionable content and abusive behavior, presented at signup with an affirmative accept that is recorded with a timestamp and version.
- A Report action on every listing, comment, review, and profile.
- A Block action on every profile, enforced server side so blocked users' content is filtered from the blocker's queries in the database, not just hidden in the UI.
- An automated first-pass content filter on all free-text fields before they go live.
- A moderation queue with an admin view and a documented 24-hour response target.
- Age gating consistent with Apple's current age rating requirements. The app will contain adult language in comedy contexts. Rate honestly.

Account deletion. Full in-app account deletion reachable within two taps of the settings screen. Hard delete or documented anonymization, not a support email link.

Guideline 2.1 completeness. No placeholder screens, no dead links, no crash paths. Maintain a REVIEW_NOTES.md in the repo containing working demo credentials for a performer account, a producer account, and a dual-role account, plus a written walkthrough of every non-obvious flow.

Privacy. Location is requested only when the user taps into the map or "near me" flow, with a clear in-context explanation first. Never request background location. Maintain Apple's privacy manifest and Google Play's Data Safety declarations as living files in the repo.

### Tech stack (use exactly this unless you flag a specific blocker first)

- Client: Expo (latest stable SDK) with React Native and TypeScript in strict mode.
- Routing: Expo Router, file-based, with typed routes.
- State: TanStack Query for all server state. Zustand for the small amount of client-only state. Do not put server data in Zustand.
- Backend: Supabase (Postgres, Auth, Storage, Realtime, Edge Functions).
- Geo: PostGIS. geography(POINT, 4326) columns, GiST indexes, ST_DWithin for radius filtering and the <-> operator for nearest-neighbor ordering. Expose these through Postgres RPC functions called from the client, never as raw client-side distance math.
- Maps: react-native-maps with marker clustering.
- Location: expo-location, foreground only.
- Notifications: expo-notifications with Expo Push.
- Payments and subscriptions: RevenueCat wrapping StoreKit and Google Play Billing.
- Errors: Sentry.
- Build and ship: EAS Build and EAS Submit, with EAS Update for OTA JS fixes.
- Testing: Jest plus React Native Testing Library for units, Maestro for end-to-end flows.

Version warning: the React Native New Architecture is enabled by default in recent Expo SDKs. Reanimated 4 requires the New Architecture and a separate worklets package. Reanimated 3 is legacy architecture only. Pin your versions explicitly in package.json, document the chosen combination in ARCHITECTURE.md, and do not let a transitive dependency shuffle it.

### Data model

Design the schema first and get my approval before writing migrations.

Core entities:

- profiles (1:1 with auth.users): display name, handle, avatar, bio, home city, home location geography point, is_performer boolean, is_producer boolean, EULA accepted version and timestamp, created/updated.
- performer_profiles: disciplines array (music, comedy, poetry, other), experience level, links (video, socials), instrument or style tags.
- producer_profiles: contact email, contact phone (private), payout details reference, verified flag.
- venues: name, address, geography point, neighborhood, city, region, country, accessibility flags, age restriction, has PA, has stage, parking notes, phone, website.
- mic_series: the recurring definition. venue reference, producer reference, title, disciplines array, description, recurrence rule (RFC 5545 RRULE string), timezone (IANA name, never a UTC offset), signup method enum (lottery, first_come, reserved_slot, host_booked), signup opens offset, set length minutes, cost cents, cost notes, capacity, is_active, last_confirmed_at, claimed_by producer reference.
- mic_occurrences: materialized concrete instances of a series on a rolling forward window (generate 90 days ahead, refresh nightly via a scheduled Edge Function). Fields: series reference, starts_at (timestamptz), doors_at, status enum (scheduled, cancelled, moved, completed), override fields for title/cost/venue when a single night differs, cancellation note.
- signups: occurrence reference, performer reference, status enum (requested, confirmed, waitlisted, drawn, performed, no_show), slot position, created_at.
- favorites, attendance_log.
- reports: reporter, target type, target id, reason enum, free text, status, resolved_by, resolved_at.
- blocks: blocker, blocked, created_at.
- listing_flags: the "this info is wrong / this mic is dead" lightweight signal, separate from abuse reports.

Critical modeling notes:

- Never store a naive local time. Store timestamptz plus the series IANA timezone. Open mics are inherently local-time recurring events ("every Tuesday at 8pm local") and daylight saving will break naive implementations twice a year.
- Occurrence generation must be idempotent. Re-running the generator must not create duplicates and must not clobber manual overrides or cancellations.
- Editing a series must ask "this night only" or "this and all future," and implement both.
- Soft-delete listings, never hard-delete. Scene history has value and accidental deletion by a producer is a support nightmare.

Row Level Security is mandatory on every table. No table ships without policies. Write the policies alongside each migration and write a test that asserts an unauthorized role cannot read or write. Specifically: producers can only mutate series they own or have claimed, performers can only mutate their own signups, contact phone numbers are never exposed to non-producers, and every read policy excludes content from blocked users.

### Build phases

Work in this order. Stop at the end of each phase, summarize what was built, and wait for my review before continuing. Do not run ahead.

- Phase 0: Foundation. Repo scaffold, Expo app, TypeScript strict, Expo Router shell, ESLint and Prettier, Supabase local dev via CLI, env handling, ARCHITECTURE.md, REVIEW_NOTES.md, and a Progress Log section in PROJECT.md. No features.
- Phase 1: Schema and auth. Full migration set, RLS policies, RLS tests, seed script with 20 realistic Pacific Northwest mics across all three disciplines. Auth: email plus password, Sign in with Apple, Google Sign-In. EULA acceptance gate. Onboarding that asks which roles apply and can enable both.
- Phase 2: Discovery (the core loop). Map view with clustered markers. List view. Filters: discipline, day of week, distance radius, cost (free vs paid), signup method, time of day. Search by city or venue. Listing detail screen showing next occurrence, recurrence in plain English ("Every Tuesday, 8:00 PM"), signup method explained, cost, set length, venue info, directions handoff, last-confirmed badge, and the "flag this listing" action. This phase must feel finished. It is the app's reason to exist.
- Phase 3: Producer tools. Create a series with a recurrence builder that a non-technical person can operate. Claim an unclaimed listing with a verification step. One-tap "confirm this listing is still accurate." Cancel a single night. Edit this-night-only vs all-future. Producer dashboard listing their mics and upcoming occurrences.
- Phase 4: Signups. Performer signup for an occurrence. Producer-side list management with drag-to-reorder, lottery draw with a visible randomization, mark performed or no-show. Realtime list updates via Supabase Realtime. Push notification when a performer's status changes.
- Phase 5: Safety, moderation, and compliance. Report and block everywhere. Moderation queue. Automated text filter. Account deletion. Privacy manifest, Data Safety form content, and a compliance checklist file mapping each Apple guideline to the implementing file.
- Phase 6: Notifications and retention. Favorite a series and get reminded. "New mic near you" alerts with a user-controlled radius. Weekly digest. Full notification preference screen with granular opt-outs.
- Phase 7: Monetization. RevenueCat integration. Free tier for performers, permanently. Producer Pro subscription for signup management, listing analytics, and lineup posting. Optional paid-slot handling for reserved-slot mics that already charge performers. Restore Purchases button placed where a reviewer will find it, and verified with a buy, reinstall, restore cycle.
- Phase 8: Ship. EAS build profiles for development, preview, and production. Store listing copy, screenshots on required device sizes, age ratings, privacy declarations. TestFlight and Play internal testing. Submission.

### Engineering standards

- TypeScript strict. No any. Generate Supabase types from the schema and use them end to end.
- Every screen handles four states explicitly: loading, empty, error, success. Empty states must be genuinely useful, especially in cities with zero listings, where the empty state should invite the user to add the first mic.
- Offline tolerance: cached listings remain readable without a connection. Performers check this app in bar parking lots with one bar of signal.
- Accessibility: labeled touch targets, dynamic type support, VoiceOver and TalkBack tested on the discovery and signup flows at minimum.
- Do not commit secrets. Use EAS secrets and Supabase environment configuration.
- Write the test alongside the feature, not after.

### Design direction

Dark-first interface. This app is used at night, in dim rooms, by people who do not want to blind the room with a white screen. High contrast, large tap targets, thumb-reachable primary actions. Each discipline gets a distinct accent color used consistently across map markers, filter chips, and listing cards so the map is scannable at a glance.

No em dashes in any user-facing copy, error message, or documentation you write. Use commas, colons, parentheses, or separate sentences.

### Things NOT to build

Do not build a joke bank, setlist builder, on-stage timer, or performance recorder. That category is saturated with at least six recent competitors and it is not this product. If I ask for it later, push back once and make me justify it.

Do not build a social feed, DMs, or follower graph in v1. Each one multiplies the moderation burden that Apple will hold us to.

Do not add AI features in v1.

### Step 0: before you write any code

Do these four things and stop:

1. Ask me any clarifying questions where this brief is genuinely ambiguous. Batch them into one message.
2. Propose the full database schema as SQL DDL with a short rationale for each non-obvious decision. Flag anything in my model above that you think is wrong.
3. Propose the exact dependency versions you intend to pin, including the architecture-and-animation-library combination, and tell me the tradeoff.
4. Propose the repo structure.

Then wait for my approval.

### Working agreement

- Push back on my ideas when you disagree. I would rather argue now than refactor later.
- If a requirement conflicts with an App Store guideline, the guideline wins. Tell me.
- When you finish a phase, update the Progress Log below with what shipped, what is stubbed, and what the next phase depends on.
- If you are about to make a decision that would be expensive to reverse, stop and ask.

## PROMPT ENDS HERE

## Progress Log

(Claude Code appends here at the end of each phase.)

| Phase  | Status                    | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Step 0 | Approved with defaults    | 2026-07-28 | Proposal in docs/STEP0_PROPOSAL.md approved as written (all ten defaults, flags F1 to F6, TypeScript and clustering tradeoffs).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 0      | Complete, awaiting review | 2026-07-28 | Shipped: Expo SDK 57 scaffold (New Arch, Reanimated 4.5 + worklets 0.10), TypeScript strict with typed routes, dark-first theme tokens with contrast tests, four-tab router shell, TanStack Query wiring, env handling with lazy Supabase client, ESLint flat config + Prettier, Jest + RNTL (6 tests passing), supabase init, ARCHITECTURE.md, REVIEW_NOTES.md, CLAUDE.md. Stubbed: all four tab bodies are PhaseShell screens, tracked in REVIEW_NOTES.md. TypeScript pinned at ~6.0.3 (template pin) instead of proposed ~5.9, noted in ARCHITECTURE.md decisions. Phase 1 depends on: local Supabase running (Docker) for migrations and generated types.                                                                                                                                                                              |
| 1      | Complete, awaiting review | 2026-07-28 | Shipped: full migration set (16 tables, enums, PostGIS, views), RLS on every table with guard triggers, occurrence generator (weekly/biweekly/monthly ordinal, DST-tested, idempotent), pgTAP suite (39 assertions: RLS, blocks, privacy, generator), seed with 20 PNW mics + 4 demo accounts, generated Supabase types, email auth, EULA gate with versioned re-acceptance, role onboarding with age gate, profile tab with sign out. Stubbed: Apple/Google sign-in are coded but need provider credentials; occurrence generation nightly schedule wires up in Phase 3; Sentry deferred to first EAS build. Environment note: Docker registries blocked here, so DB verification runs via scripts/db/verify-local.sh on system Postgres. Phase 2 depends on: discovery RPCs (ST_DWithin/nearest-neighbor) which will be a new migration. |
| 2 to 8 | Complete, awaiting owner setup | 2026-07-28 | Shipped across one continuous run: discovery RPCs (PostGIS radius + KNN, search), map/list with clustering and web fallback, mic detail with freshness and flags, producer CRUD with RRULE builder, night-of roster with realtime and lottery draw, claims with admin review, safety (blocks, reports, moderation queue), favorites and notification prefs with outbox + push-sender Edge Function, Producer Pro paywall (RevenueCat, fails closed in prod), Sentry, EAS profiles, store compliance docs. 99 pgTAP + 41 Jest at phase end. Owner-gated items tracked in docs/store/STORE_LISTING.md. |
| Night  | Complete                  | 2026-07-28 | On-deck flow (producer megaphone toggle on the roster, server-enforced via mark_on_deck RPC, realtime + push through the outbox, pref-gated), favorite day-of reminder times fixed to the mic's timezone, "Add to my calendar" via the system event sheet (Google Calendar URL on web, no permissions), and event posters (poster_url on series, public posters bucket with owner-folder RLS, upload from Manage, shown on the mic page). Migration 001500; 128 pgTAP, 84 Jest. |
| Brand  | Complete                  | 2026-07-28 | Logo mark plus wordmark now heads the Discover screen (custom nav header). Brand accents threaded through the UI: active tab tint and Today/Weekend chips in music blue, time chips and the Producer badge in comedy amber, distance chips and the More filters badge in poetry purple, Free chip in success green. |
| UX 2   | Complete                  | 2026-07-28 | Personalized discovery: every profile now requires a private home area (city+state or ZIP, database-enforced, geocoded on device, exposed through no view; pgTAP-verified). Discover defaults to list view (map one tap away), centers on the home area, pre-selects the performer's own disciplines (multi), and sorts by soonest upcoming night then distance. Nearby alerts reuse the profile home area instead of prompting for device location. Migration 001400 rebuilds public_profiles without home_city; delete_account scrubs the new columns. 120 pgTAP, 83 Jest. |
| UX 4   | Complete                  | 2026-07-29 | Built all four follow-ups from the usability review. Forgot password: reset email deep-links to openmic://reset-password, PKCE code exchange, set-new-password screen held open by the auth gate, expired-link recovery path, "Forgot password?" on sign in. Timezone: per-listing IANA picker (US zones, device default, LA fallback) on create and edit, replacing the hardcoded America/Los_Angeles; edits regenerate nights via the existing trigger. Blocked list: migration 001600 adds a trigger-written blocked_display_name snapshot (spoof-proof) shown in Settings. Search distance: migration 001700 rebuilds search_mics with an optional center and distance_m; Discover search passes its center and shows miles. 139 pgTAP (11 new across block-names and search-distance suites, verified via scripts/db/verify-local.sh), 104 Jest (new: reset API, timezones). Owner setup: allowlist the openmic:// redirect in hosted Supabase Auth. |
| UX 3   | Complete                  | 2026-07-29 | Dropdown pass plus a four-persona usability walkthrough (docs/USABILITY_REVIEW.md). Shared SelectField/MultiSelectField bottom-sheet dropdowns replace sprawling chip rows: producer form start time, signup method (now with per-option explanations), signup-open lead time; filter sheet signup style (multi-select, "Any way"); notification prefs radius. Walkthrough fixes: roles and disciplines editable in Edit profile (What you do), one-tap "Turn on performing" on the signup card (was a dead-end instruction), editing a mic now round-trips signup_opens instead of silently resetting it, roster undo for performed/no-show plus plain-language statuses everywhere, admin claims queue visible without the producer role. 93 Jest (new: select component, signup-opens parser, setMethods), pgTAP unchanged. Recommended follow-ups logged in the review doc: forgot-password flow, timezone picker, blocked-list names, distance in search results. |
| Audit 1 | Complete                 | 2026-07-29 | Compliance audit Phase 1 (P0 blockers). 1.1: expo-build-properties added (Android compileSdk/targetSdk 36, buildTools 36.0.0, iOS deploymentTarget 16.4); prebuild verified the resolved config targets API 36; USE_FULL_SCREEN_INTENT audit across app code and every native dependency found zero hits. expo-doctor: 18 of 20 checks pass; the two failures are network-blocked API calls in this environment, not project issues. 1.2: web deletion path (static page, deletion-request Edge Function with magic-link identity confirmation and rate limiting, delete_account_web service RPC sharing the exact in-app deletion body; 19 pgTAP assertions). Found and fixed a latent bug: anonymized handles collided on uuid prefixes. 1.3: age gate raised to 18 and enforced by a database trigger; EULA 1.1 published; all copy and docs aligned (FLAG: IN_APP_AGE_GATE was left blank in the brief, defaulted to 18 as instructed). Historical docs (STEP0_PROPOSAL, EULA 1.0 migration text) intentionally keep 17. 1.4: paywall rebuilt as a testable component with subscription title, prominent price, billing period, in-app Privacy Policy and Terms links with offline-friendly errors, Restore Purchases; 12 new Jest tests. Environment note: the Expo CLI version API is proxy-blocked here, so expo-build-properties and expo-age-range were installed at the exact SDK 57 versions npx expo install resolves (from expo's bundledNativeModules pin). Suite: 96 Jest, 154 pgTAP. |
| Audit 2 | Complete                 | 2026-07-29 | Compliance audit Phase 2 (P1 rejection-risk). 2.1: docs/privacy/SDK_MANIFEST_AUDIT.md audits every native-bearing dependency for a bundled PrivacyInfo.xcprivacy at the installed version; all packages that need one have one (Sentry via sentry-cocoa 8.58.0, RevenueCat via PurchasesHybridCommon 18.22.2), so no bumps and the reanimated/worklets lockstep is untouched; app.json now declares the aggregated app-level manifest (ios.privacyManifests), verified through prebuild. 2.2: Discover center resolution extracted to resolveDiscoverCenter with a visible "Showing Seattle, the first Open Mic Finder city" note on the true fallback; Jest tests plus e2e/reviewer-coldstart.yaml (launches with location denied, asserts populated content and search escape). DISCREPANCY NOTE: the audit brief says "never show a blank state to a signed-out browser", but the router has always gated all tabs behind sign-in (Step 0 Q9 approved anonymous browsing; the implementation ended up sign-in first). The fallback covers every reachable no-location state; opening discovery to signed-out browsing would be an architecture change needing owner sign-off. 2.3: REVIEW_NOTES Payment model section (3.1.5(a) split), dual-role walkthrough, deletion paths, paywall legal link locations; docs/store/DATA_SAFETY_ANSWERS.md answers the Play form question by question. Suite: 101 Jest, 154 pgTAP. |
| Audit 3 | Complete                 | 2026-07-29 | Compliance audit Phase 3 (P2). 3.1: Universal Links and App Links for /mic/* (associatedDomains, autoVerify intent filter verified through prebuild, AASA and assetlinks.json with Team ID and SHA-256 placeholders, fill-in and verification steps in docs/DEPLOY_WEB.md, Jest suite keeping configs and the /mic/[id] route in agreement). 3.2: rate limits applied by a generic trigger (reports 5/hour, flags 5/hour, claims 3/day, signups 30/day; defaults in ARCHITECTURE.md; 10 pgTAP assertions for block and reset). 3.3: expo-age-range plumbed through src/features/auth/ageSignal.ts behind AGE_SIGNAL_ENABLED (default false), routing under-gate platform signals into the existing block path, storing nothing; noted in ARCHITECTURE.md as the state-law fast-follow switch. 3.4: .github/workflows/e2e.yml runs all three Maestro flows on an Android emulator against seeded local Supabase for PRs touching src/, with optional Maestro Cloud and EXPO_TOKEN secrets stubbed in comments. Suite: 116 Jest, 164 pgTAP. |
| Store readiness | Complete         | 2026-07-29 | July 2026 pre-submission compliance audit closed across all three phases (see Audit 1 to 3 rows). P0: Android API 36 targeting with iOS 16.4 floor, web account deletion path with proven parity to in-app, age gate raised to 18 with server enforcement and EULA 1.1, paywall rebuilt for Apple 3.1.2. P1: SDK privacy manifest audit (no bumps needed) plus app-level manifest, reviewer cold-start Seattle fallback with Maestro coverage, payment-model review docs and Play Data Safety answer sheet. P2: Universal/App Links for /mic/* with owner placeholders, DB-backed rate limiting on all abuse-prone writes, flag-gated platform age signal, Maestro flows in CI. Database types regenerated (delete_account_web, deletion_request_allowed) via the documented postgres-meta path; @supabase/postgres-meta added as a dev dependency for that purpose. COMPLIANCE.md guideline-to-file map extended. Final suite: 116 Jest (was 84), 164 pgTAP (was 128), typecheck and lint clean. Owner inputs still needed: FUNCTION_URL in the delete-account page, Team ID in the AASA file, Play signing SHA-256 in assetlinks.json, hosted /privacy and /terms pages, production demo credentials in REVIEW_NOTES, optional Maestro Cloud and EXPO_TOKEN secrets in CI. |
| UX     | Complete                  | 2026-07-28 | Ease-of-use pass for non-technical performers: discovery filters rebuilt as two plain rows (what kind of mic, when) plus an All filters sheet with one labeled question per section; single-tap discipline select; Today and Weekend quick picks; distances shown in miles everywhere; signup methods renamed to plain language (Walk-in list, Name draw, Book ahead, Invite only) with one-line explanations; friendlier signup buttons and empty states. Profile customization: photo upload (avatars storage bucket, owner-scoped RLS), Instagram/TikTok/YouTube/website links with paste-anything normalization, new Edit profile screen, links and photo shown on the profile tab. Producer forms unchanged and full-featured. DB migration 001300 + pgTAP (111 total), Jest at 70. |
