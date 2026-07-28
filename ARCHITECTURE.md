# Architecture

Living document. Records the stack, the pinned version combination, and decisions with their reasoning. Update whenever a decision here changes.

## Stack

| Layer         | Choice                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Client        | Expo SDK 57, React Native 0.86, React 19, TypeScript strict                                                                                    |
| Routing       | Expo Router (file based, typed routes enabled)                                                                                                 |
| Server state  | TanStack Query v5 (all data from Supabase lives here)                                                                                          |
| Client state  | Zustand v5 (UI-only state; server data never goes in Zustand)                                                                                  |
| Backend       | Supabase: Postgres + PostGIS, Auth, Storage, Realtime, Edge Functions                                                                          |
| Maps          | react-native-maps with supercluster-based clustering (Phase 2)                                                                                 |
| Location      | expo-location, foreground only, requested in context                                                                                           |
| Notifications | expo-notifications + Expo Push (Phase 4+)                                                                                                      |
| Payments      | RevenueCat for Producer Pro subscription; paid slots use an external processor, never IAP (Apple 3.1.5(a), see docs/STEP0_PROPOSAL.md flag F4) |
| Errors        | Sentry via @sentry/react-native config plugin (added Phase 1)                                                                                  |
| Build/ship    | EAS Build, EAS Submit, EAS Update                                                                                                              |
| Tests         | Jest + jest-expo + React Native Testing Library; Maestro for e2e; pgTAP for RLS                                                                |

## The architecture and animation combination (pinned)

**New Architecture with Reanimated 4 + react-native-worklets.** React Native 0.82+ removed the legacy architecture, so on SDK 57 (RN 0.86) this is the only supported combination. Reanimated 3 is not an option on this stack.

Pinned pairs that must move together, never via a transitive bump:

- `react-native-reanimated` 4.5.0 + `react-native-worklets` 0.10.0 (the SDK 57 template pairing; upgrade only both at once, only to a pairing Expo documents as SDK-compatible)
- All `expo-*` packages upgrade via `npx expo install`, never by hand, so they stay SDK-matched.

Renovate/dependabot, when added, must be configured to exclude these from automatic major bumps.

## Decisions log

- **2026-07-28, TypeScript ~6.0.3.** Step 0 proposed ~5.9, but the SDK 57 template pins ~6.0 (still the standard TypeScript compiler). We follow the template pin. npm `latest` is now TypeScript 7 (the Go compiler); we do not adopt it until the Expo toolchain does.
- **2026-07-28, React Compiler experiment stays on.** The SDK 57 template enables `experiments.reactCompiler`. Kept: it removes a class of manual memoization work. If it miscompiles anything we turn it off in app.json and note it here.
- **2026-07-28, dark-first enforced at the config level.** `userInterfaceStyle` is `dark`, splash and adaptive icon backgrounds use the app background color, and the navigation theme derives from `src/theme/tokens.ts`. Tokens are the single source of truth for color, spacing, and type; per-discipline accent colors live there and are contrast-tested in `src/theme/tokens.test.ts`.
- **2026-07-28, screens are thin.** Files under `src/app/` only route and compose; all real UI and logic lives in `src/components` and `src/features/<feature>/` so it is testable without the router.
- **2026-07-28, Supabase env via EXPO_PUBLIC\_ vars.** The anon key and URL are build-time public values (`src/lib/env.ts`). Real secrets live in EAS secrets and Supabase Edge Function config only. `.env` is gitignored; `.env.example` documents the shape.
- **2026-07-28, lazily created Supabase client.** `src/lib/supabase.ts` constructs the client on first use so module import never throws in tests. It gains the generated `Database` type parameter in Phase 1.

- **2026-07-28, recurrence model: RRULE for the date pattern only.** Deviation from the approved Step 0 DDL, for the better: a bare RRULE string cannot cleanly carry "every Tuesday at 8pm local" without a DTSTART, and parsing DTSTART out of a string invites bugs. `mic_series` stores `rrule` (FREQ/INTERVAL/BYDAY only), `start_time` (local wall clock), `doors_offset`, and `anchor_date` (fixes biweekly parity). `starts_at` is computed as local date + start_time interpreted in the series IANA timezone, which makes DST handling correct by construction. The generator supports FREQ=WEEKLY (any INTERVAL, multi BYDAY) and FREQ=MONTHLY (ordinal BYDAY like 1TU, 3TU, -1FR), which covers real open mic schedules. pgTAP tests pin DST behavior across the November 2026 fall-back.
- **2026-07-28, occurrence generation in SQL, triggered on write.** `private.generate_occurrences()` is a SECURITY DEFINER SQL function, invoked by a trigger when a series is created or its recurrence fields change, and designed to be called nightly by a scheduled job (pg_cron or Edge Function, wired up in Phase 3). Idempotency comes from `unique (series_id, local_date)` plus `on conflict do nothing`: regeneration can never duplicate a night or clobber a cancellation or override.
- **2026-07-28, moderation and privilege guards are triggers, not client trust.** `eula_accepted_at`, `is_admin`, `producer_profiles.verified`, and `moderation_status` are stamped or pinned server side by BEFORE triggers; user-editable free text always re-enters the moderation queue as `pending`. RLS controls row access; triggers control field-level integrity.
- **2026-07-28, private columns via views.** RLS cannot hide columns, so `profiles` and `producer_profiles` deny non-owner selects on the base table and expose `public_profiles`, `performer_public`, and `producer_public` views instead. `contact_phone`, `payout_ref`, `home_location`, and `birth_year` never appear in any view. The views also apply block filtering in both directions.
- **2026-07-28, local DB verification without Docker.** This environment cannot pull container images (registry CDNs are blocked by network policy), so `scripts/db/verify-local.sh` runs the full migration set, seed, and pgTAP suite against system Postgres 16 + PostGIS, with `scripts/db/shim-supabase.sql` reproducing the platform environment (API roles, default grants, auth schema, auth.uid()/auth.role()). The shim is a local harness only and is never applied to a real Supabase project. With Docker available, `supabase test db` is the canonical path.
- **2026-07-28, type generation via @supabase/postgres-meta.** `supabase gen types` also needs Docker, so types are generated by driving the postgres-meta library directly against the verified local database. The generated `src/types/database.types.ts` must be regenerated (`npm run db:types` once Docker is available) after any migration change; PostGIS helper relations appearing in the file are a known cosmetic artifact of the shim environment.

- **2026-07-28, discovery queries live in SQL RPCs.** `mics_near` (ST_DWithin radius, `<->` KNN ordering, all filters server side) and `search_mics` are SECURITY INVOKER so RLS applies to anonymous discovery. The client never does distance math.
- **2026-07-28, clustering via supercluster directly.** As planned in Step 0: a small in-house map component feeds `supercluster` and renders glyph markers, instead of depending on the unmaintained react-native-map-clustering wrapper.
- **2026-07-28, offline reads via TanStack Query persistence.** PersistQueryClientProvider with an AsyncStorage persister (24 h maxAge) keeps listing data readable without a connection. This covers the offline-tolerance standard without a custom cache layer.
- **2026-07-28, brand.** Official name: Open Mic Finder. Logo recreated as vector components (react-native-svg) in src/components/logo.tsx; wordmark typography is Poppins (loaded at the root layout). The three logo arcs are the discipline accents from src/theme/tokens.ts.

- **2026-07-28, notification outbox pattern.** Database triggers and scheduled queue functions write to notification_outbox; the push-sender Edge Function drains it via Expo Push under the service role. Notifications are decoupled from request paths and every enqueue is idempotent per subject.
- **2026-07-28, list reorder without a drag dependency.** The producer list uses up/down controls instead of drag-to-reorder: the maintained drag-list libraries predate Reanimated 4 and the New Architecture. Revisit when a compatible library stabilizes; the set_slot_order RPC already accepts an arbitrary full ordering, so only the gesture layer would change.
- **2026-07-28, monetization boundaries.** RevenueCat handles only the Producer Pro subscription. Freshness actions (create, confirm, cancel) are never paywalled; performer features are free permanently; paid reserved slots are settled outside the app (Apple 3.1.5(a)). Entitlement resolution is a tested pure function; unconfigured production builds fail closed.
- **2026-07-28, Sentry.** Initialized only when EXPO_PUBLIC_SENTRY_DSN is set; sendDefaultPii is off and no user identity is attached, matching the privacy declarations.

## Repo layout

See docs/STEP0_PROPOSAL.md section 4 for the full annotated tree. Summary: `src/app` is routes only, `src/features` holds feature modules, `src/lib` holds clients, `src/theme` holds tokens, `supabase/` holds migrations (with RLS policies and pgTAP tests alongside), Edge Functions, and seed data.
