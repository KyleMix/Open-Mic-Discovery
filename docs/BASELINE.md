# Baseline: store readiness pass, 2026-08-08

Phase 0 inventory taken before any readiness changes. Commands were run for
real in a clean checkout on this date; outputs below are pasted, not assumed.

One framing note up front: this repository is not a greenfield app with build
problems. It has been through eight build phases, multiple audits, a rebrand,
and a database-side admin buildout. Most of what a "store readiness pass"
usually has to create already exists. This pass therefore verifies, tightens,
and documents rather than rescues, and the defect list reflects that.

## Naming inventory (asked for explicitly in the brief)

| Where                                               | Value                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| GitHub repo                                         | `KyleMix/Open-Mic-Discovery`                                                  |
| Product name, `app.json` `expo.name`                | `Open Mic Explorer`                                                           |
| npm package name                                    | `openmicexplorer`                                                             |
| Expo slug                                           | `openmic`                                                                     |
| URL scheme                                          | `openmicexplorer`                                                             |
| iOS bundle identifier                               | `com.openmicexplorer.app`                                                     |
| Android package                                     | `com.openmicexplorer.app`                                                     |
| Web domain (applinks, deletion page, support email) | `openmicfinder.app`                                                           |
| Support email constant                              | `support@openmicfinder.app` (placeholder, decision 11 in DECISIONS_NEEDED.md) |

Flags, no silent renames made:

- The repo name (`Open-Mic-Discovery`) and slug (`openmic`) differ from the
  product name. Neither is user facing and neither blocks submission. The slug
  is welded to the EAS project id and should not be changed now.
- The domain is `openmicfinder.app` while everything else says "explorer".
  This IS user facing (universal links, deletion page, support email). If the
  owner owns `openmicfinder.app`, it works as is; if the intent is an
  `openmicexplorer` domain, the associated domains, intent filters, deletion
  page URL, and support address all need one coordinated change. Called out in
  LAUNCH-CHECKLIST.md; not changed here because only the owner knows which
  domain is actually registered.

## Directory tree (meaningful source)

```
app.json  eas.json  tsconfig.json  eslint.config.js  package.json
src/
  app/                 Expo Router routes (see route table below)
    (auth)/            eula, onboarding, sign-in, sign-up, forgot/reset password
    (tabs)/            index (Discover), favorites, going, producer, profile
    producer/          [id], new, analytics/[id], credits/[id], live/[occ], night/[occ]
    mic/[id]           listing detail
    admin, settings, edit-profile, notification-prefs, privacy, terms,
    auth-callback, test-kit
  components/          shared UI (ui.tsx, toast, select, screen-header, ...)
  features/            auth, calendar, credits, discovery, favorites, legal,
                       live, notifications, plans, producer, profile, safety,
                       signups, testkit (each with queries.ts + components + tests)
  lib/                 env, supabase, query-client, notifications, realtime,
                       sentry, support, image-url, user-error
  stores/              zustand: filters, onboarding, recent-searches, return-to
  test/                query-harness, supabase-fake
  theme/               tokens
  types/               database.types.ts (generated Supabase types)
supabase/
  migrations/          71 migrations, 20260728000100 .. 20260807001700
  tests/               40 pgTAP files, 713 planned assertions
  functions/           deletion-request, push-sender (Deno edge functions)
  seed.sql             demo data incl. reviewer accounts
web/delete-account/    static Play-required deletion page
e2e/                   Maestro flows: discovery, signup, reviewer-coldstart
.github/workflows/     ci.yml (typecheck, lint, unit, pgTAP), e2e.yml (Maestro)
docs/                  compliance, privacy, store, admin, audit, pitch subtrees
scripts/               check-backend.mjs, dev/, db/, brand/
marketing/             feature overview + screenshots
```

200 TypeScript files under `src/`, 71 test suites among them.

## Runtime config summary

| Item                  | Value                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo SDK              | 57 (`expo@57.0.9` installed)                                                                                                                                         |
| React Native          | 0.86.2 (prebuild recommends 0.86.0; patch drift only)                                                                                                                |
| React                 | 19.2.3                                                                                                                                                               |
| TypeScript            | 6.0.3, `strict: true` already enabled                                                                                                                                |
| Package manager       | npm (package-lock.json committed), npm 10.9.7                                                                                                                        |
| Node                  | v22.22.2 (CI pins 22)                                                                                                                                                |
| Router                | expo-router 57.0.9, typed routes on, React Compiler on                                                                                                               |
| Reanimated / worklets | 4.5.1 / 0.10.1 (the pinned pair from ARCHITECTURE.md)                                                                                                                |
| EAS                   | eas.json present: development, preview, testflight, production profiles; `appVersionSource: remote`; project id b44e6a07-5276-481b-9679-8e3e1e681692, owner kylem_ix |
| Config file           | `app.json` (static; no app.config.ts)                                                                                                                                |
| New-arch flags        | targetSdk/compileSdk 36, iOS deployment target 16.4, privacy manifest inline in app.json                                                                             |

No workspaces: `package.json` declares none, and there is no second app
package in the repo (see the moderation console finding below).

## Routes and who can reach them

Auth gate lives in `src/app/_layout.tsx` (AuthGate). Unauthenticated users can
browse discovery read-only; writes prompt sign-in.

| Route                                                               | Reachable by                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| (auth)/sign-in, sign-up, forgot-password, reset-password            | unauthenticated                                                               |
| (auth)/onboarding, eula                                             | authenticated, pre-acceptance                                                 |
| (tabs)/index Discover                                               | everyone (guest browse allowed)                                               |
| (tabs)/favorites                                                    | authenticated, both roles                                                     |
| (tabs)/going                                                        | authenticated, performer-leaning, both roles see it                           |
| (tabs)/producer My Mics                                             | authenticated; content varies by producer role                                |
| (tabs)/profile                                                      | authenticated                                                                 |
| mic/[id]                                                            | everyone (guest browse)                                                       |
| producer/[id] (manage a series you own)                             | producer role, owner of that series                                           |
| producer/new, analytics/[id], credits/[id], live/[occ], night/[occ] | producer role                                                                 |
| admin                                                               | accounts with `profiles.is_admin` (hidden otherwise)                          |
| settings, edit-profile, notification-prefs                          | authenticated                                                                 |
| privacy, terms                                                      | everyone, including at the EULA gate                                          |
| auth-callback                                                       | deep link target for auth flows                                               |
| test-kit                                                            | tester accounts only, server-gated, off by default (migration 20260807000400) |

## Supabase surface referenced by code

Tables (30 in migrations, all with RLS enabled; the two lists match exactly):
admin.admin_invites, admin.admin_users, admin.audit_log,
admin.security_settings, attendance_log, attendance_plans, banned_terms,
blocks, claim_requests, device_push_tokens, eula_versions, favorites,
listing_flags, mic_credits, mic_occurrences, mic_series, notification_outbox,
notification_prefs, performer_profiles, private.rate_limit_counters,
producer_profiles, profiles, report_triage, reports, series_search, signups,
test_kit_objects, test_kit_settings, user_sanctions, venues.

Views: admin_producer_review, admin_profile_review, blocked_profiles,
mic_credit_public, my_upcoming_nights, occurrence_attendance,
occurrence_spots, performer_public, plan_roster, producer_public,
public_profiles, signup_roster.

Functions: 115 distinct functions defined across migrations (RPCs, triggers,
private helpers). RPCs called from the app: search_discover, signup_counts,
set_slot_order, review_claim, resolve_flag, my_waitlist_rank,
moderate_content, mark_on_deck, end_show, draw_lottery, delete_account, plus
eight test_kit_* RPCs behind the server-side test-kit gate.

Storage buckets: `avatars` (src/features/profile/avatar.ts:46,
src/features/safety/queries.ts:96, supabase/functions/deletion-request:115),
`posters` (src/features/producer/poster.ts:47).

Edge functions: `deletion-request` (web account deletion), `push-sender`
(Expo push batches, invoked by pg_cron + pg_net).

Full file-and-line listing of every `.from()`, `.rpc()`, and `storage.from()`
call in non-test code: 110 references, verified 2026-08-08. The heaviest
users are src/features/producer/queries.ts (21 refs),
src/features/signups/queries.ts (17), src/features/safety/queries.ts (16),
src/features/discovery/queries.ts and plans/favorites/profile/credits
(4 to 8 each). Regenerate the exact listing any time with:

```
grep -rnoE "\.(from|rpc)\('[a-z_]+'" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

## Environment variables read anywhere in code

| Variable                                                             | Read in                        | Purpose                                                         |
| -------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| EXPO_PUBLIC_SUPABASE_URL                                             | src/lib/env.ts                 | backend URL, required, throws if unset                          |
| EXPO_PUBLIC_SUPABASE_ANON_KEY                                        | src/lib/env.ts                 | anon key, required, throws if unset                             |
| EXPO_PUBLIC_SENTRY_DSN                                               | src/lib/sentry.ts              | crash reporting, inert when unset                               |
| EXPO_PUBLIC_IMAGE_TRANSFORMS_ENABLED                                 | src/lib/image-url.ts           | Storage render endpoint flag, off unless exactly "true"         |
| EXPO_PUBLIC_AGE_SIGNAL_ENABLED                                       | src/features/auth/ageSignal.ts | platform age signal, flagged off                                |
| CODESPACES, CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN | scripts/dev                    | local dev URL rewriting only                                    |
| TZ, OPENMIC_TEST_TZ                                                  | test harness                   | deterministic test timezones                                    |
| SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY                              | supabase/functions (Deno env)  | server side only, injected by Supabase, never in the app bundle |

`.env.example` documents each client variable and where its value comes from.

## Check results (real output, this machine, 2026-08-08)

- `npm install`: exit 0.
- `npm run typecheck` (tsc 6.0.3, strict): **clean, zero errors.**
- `npm run lint` (expo lint, `no-explicit-any` at error): **clean.**
- `npm test`: **71 suites, 493 tests, all passing**, 47.7 s. One warning:
  "A worker process has failed to exit gracefully", a teardown leak in the
  jest-expo environment; tests still pass and exit 0. Logged as Low.
- `npx expo-doctor` (1.20.1): 18/20 passed. The two failures are this
  sandbox's egress allowlist, not the project: the app.json schema check and
  the React Native Directory metadata check both need api.expo.dev /
  reactnative.directory, which the proxy here forbids ("Host not in
  allowlist" / HTTP 403). Version alignment was instead verified offline:
  every SDK-managed dependency satisfies the range in
  `expo/bundledNativeModules.json` for SDK 57.
- `npx expo install --check`: blocked by the same proxy (Forbidden). Same
  offline verification applies.
- `npx expo prebuild --platform android --no-install`: **succeeds.** Notes it
  would prefer react-native 0.86.0 over 0.86.2, and Sentry org/project are
  not in app.json (they come from env at EAS build time, by design).
  Generated android/ directory and the package.json touch were reverted;
  this repo uses CNG and does not commit native folders.
- Trial run of the three additional compiler flags the brief requires
  (`noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`): **46 new errors**, all from
  noUncheckedIndexedAccess, concentrated in tests (27) and map/recurrence
  code (19). Fixed in Phase 1.
- Cold-start boot in both roles: not runnable in this environment (no
  emulator). Covered by `e2e/reviewer-coldstart.yaml` plus the discovery and
  signup Maestro flows, which run in CI on an Android emulator against a
  seeded local Supabase stack (.github/workflows/e2e.yml).

## Moderation console: the one big discrepancy against the brief

The brief describes a Next.js 15 moderation console with AAL2 MFA living in
this repo. **No console application exists in the repo.** What exists:

- The complete database side, built and pgTAP-tested in migrations
  20260807001000 through 20260807001700: admin allowlist (invite only, owner
  managed), append-only audit log with reversal links, report triage states,
  user sanctions, read-only admin tier, PII masking with audited reveal, and
  AAL2/step-up enforcement functions **shipped switched off** pending MFA
  enrollment (`admin.security_settings`).
- An in-app moderation screen, `src/app/admin.tsx`, gated on
  `profiles.is_admin`, showing held content, abuse reports, and listing
  flags, acting through the same `moderate_content` / `resolve_flag` /
  `resolve_report` RPCs.
- `docs/admin/RUNBOOK.md`, which states plainly: "The moderation console is
  not built," and documents SQL-editor procedures for everything the console
  would do.

Apple's Guideline 1.2 requires a working 24-hour takedown path, which the
in-app admin screen provides. It does not require a web console. Whether to
build the console before submission is an owner decision, asked as a
multiple-choice question in the pass summary and recorded in
LAUNCH-CHECKLIST.md.

## Prioritized defect list

Blockers (submission stops until fixed): none found in code. The blocking
items are all account-level and live in LAUNCH-CHECKLIST.md (no Apple or
Google developer account, no hosted production Supabase project, no live
privacy policy URL, support email placeholder).

High:

1. A real Google Maps Android API key is committed in `app.json`
   (`android.config.googleMaps.apiKey`) and therefore in git history. Maps
   SDK for Android keys are designed to ship in the app binary, so this is
   not a service-role-style leak, but an unrestricted key can be lifted and
   billed. Fix: restrict the key in Google Cloud Console to the Android app
   (package `com.openmicexplorer.app` plus release SHA-1) or rotate to a new
   restricted key. Config change alone cannot un-leak history. Owner action,
   in LAUNCH-CHECKLIST.md; the repo side (documenting the restriction
   requirement in ENV.md) is done in this pass.
2. Moderation console absent (see section above). Decision needed: submit
   with the in-app admin screen as the takedown path, or build the console
   first. The AAL2 enforcement toggle should flip on either way once the
   owner enrolls MFA.
3. Stewardship migration `20260804000100_discovery_stewardship.sql` is
   committed but deliberately not applied to any hosted project (decision 12
   in DECISIONS_NEEDED.md). Client code degrades gracefully without it.
   Needs an owner apply-and-regen-types step, in LAUNCH-CHECKLIST.md.

Medium:

4. The three extra strict flags surface 46 type errors (Phase 1 fixes them).
5. `eas.json` submit.production is an empty object: no ascAppId, no Android
   service account path. Cannot be filled until store accounts exist; the
   exact values to paste are specified in LAUNCH-CHECKLIST.md.
6. Support email is the documented placeholder constant
   (`src/lib/support.ts`). Single-point change by design; owner supplies the
   real inbox.
7. react-native 0.86.2 vs the SDK-pinned 0.86.0: harmless patch drift today,
   but it is the one dependency `expo install --check` would flag. Aligned in
   Phase 1 by pinning what prebuild expects, to keep EAS builds deterministic.

Low:

8. Jest worker teardown warning (tests pass; cosmetic in CI logs).
9. expo-doctor cannot complete two network checks from this sandbox;
   rerun `npx expo-doctor` once from an unrestricted machine before the first
   EAS build for a clean 20/20.
10. Repo/product/domain naming drift (table above): document, decide on the
    domain, change nothing silently.
