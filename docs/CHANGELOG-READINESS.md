# Store readiness pass: changelog

Every change made by the 2026-08-08 readiness pass, grouped by phase, with
rationale. Branch: `claude/open-mic-store-readiness-kpky50` (the session's
designated branch; the brief asked for `chore/store-readiness`, and the
name is the only difference).

## Phase 0: inventory

- Added `docs/BASELINE.md`: full inventory, real check output, prioritized
  defect list. Key finding: the repo was already healthy (typecheck, lint,
  and all 493 Jest tests green on arrival), and the moderation console the
  brief describes does not exist; its database layer does. No code
  changed in this phase.

## Phase 1: build health

- `tsconfig.json`: added `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch` (strict was already on). Fixed all 46
  resulting errors with real guards, no suppressions:
  - `mic-map.tsx`: malformed GeoJSON coordinates now skip the marker
    instead of crashing the map.
  - `recurrence.ts`, `rrule-builder.ts`: regex match groups guarded before
    indexing.
  - `night/[occurrenceId].tsx`: roster reorder bounds-checked before the
    swap.
  - `filter-bar.tsx`, `query-tokens.ts`, `signup-opens.ts`: day and choice
    lookups get honest fallbacks.
  - Test files: tuples and loud throw-if-missing helpers instead of
    non-null assertions.
- Removed four never-imported native modules (`@expo/ui`, `expo-device`,
  `expo-glass-effect`, `expo-symbols`); each autolinked dead native code
  into both binaries. `expo-system-ui` deliberately kept: its config
  plugin applies `expo.backgroundColor` at prebuild.
- Removed six unreferenced template tab icons (`assets/images/tabIcons/`).
- Confined the six test kit `as unknown as` casts to one documented
  `fromJson` helper (`src/features/testkit/queries.ts`). Remaining casts
  in the codebase (3) each carry a documenting comment and predate this
  pass: vendored navigation type in `discard-guard.tsx`, untyped
  `FontAwesome6` in `social-links.tsx`, filter logging in
  `(tabs)/index.tsx`.
- Verified after each change: typecheck clean, lint clean, 493 Jest tests
  pass, `expo prebuild` succeeds. `expo-doctor` 18/20 in this sandbox; the
  two failures are its blocked network, and package alignment was proven
  offline against `expo/bundledNativeModules.json` (all SDK-managed
  packages in range; react-native 0.86.2 vs pinned 0.86.0 is deliberate
  patch drift, kept because the lockfile is consistent and patch releases
  carry fixes).

## Phase 2 and 3: compliance, data, security

- New migration `20260808000100_moderation_actions_are_audited.sql` (+
  down migration + 12 pgTAP tests in
  `supabase/tests/moderation-audit.test.sql`): `moderate_content`,
  `resolve_flag`, and `review_claim` now append before/after state to
  `admin.audit_log` with the session as actor, and report resolutions by
  direct update are audited by trigger. Rationale: the audit log existed
  but nothing wrote to it, and the in-app takedown path is what Apple's
  Guideline 1.2 review exercises. Signatures unchanged; the app needed no
  changes. Sessionless automation still appends nothing, honoring the
  log's own design decision.
- Verified live on a fresh database (not by reading code): all 72
  migrations apply cleanly, seed loads, 707 pgTAP assertions pass, and
  the full loop (report -> queue -> takedown -> hidden from non-admins ->
  audit rows) was traced by hand. All 30 tables have RLS enabled. The
  only key in the client bundle is the anon key.
- `docs/COMPLIANCE.md`: appended the verification record.

## Phase 4: runtime robustness

- Verified, no changes needed: root `ErrorBoundary` wired to Sentry with
  retry (`_layout.tsx`), offline banners on the four read surfaces,
  loading/empty/error/retry states built into the shared `ui.tsx`
  components, permission-denial fallbacks (Seattle center, push primer),
  accessibility labels on the surfaces spot-checked. Device-dependent
  checks are captured as the manual script in `docs/TEST-PLAN.md`.

## Phase 5: identity, assets, versioning

- `assets/images/icon.png` re-encoded RGB without its alpha channel (every
  pixel was already opaque; App Store Connect rejects transparency in the
  1024 marketing icon). Adaptive icon, monochrome, splash: verified
  correct, transparency kept where it belongs.
- Verified: bundle id and package `com.openmicexplorer.app` consistent;
  version 1.0.0 with EAS remote `autoIncrement` handling build numbers
  (documented in LAUNCH-CHECKLIST). Naming drift (repo name, `openmic`
  slug, `openmicfinder.app` domain) documented in BASELINE.md and raised
  as decision D3; nothing renamed silently.

## Phase 6: pipeline

- `eas.json`: filled the `submit.production` skeleton with
  self-describing placeholders (Apple `ascAppId` to paste after the app
  record exists; Android service account path + internal track).
- `.gitignore`: added `play-service-account.json` so the Play API key can
  never be committed.
- Verified existing: CI already runs typecheck, lint, unit tests, and
  pgTAP on push, plus Maestro e2e on PRs; crash reporting (Sentry)
  already integrated with a privacy-compliant, crash-only configuration.
- Deliberately NOT added: an analytics SDK. Every privacy declaration in
  the repo says "no analytics, no tracking", and adding one would change
  the store forms, the privacy manifest, and user-facing privacy copy.
  That is an owner decision, not a readiness fix; Sentry crash data plus
  the zero-result search log cover launch needs.

## Deliverables added

`docs/BASELINE.md`, `docs/CHANGELOG-READINESS.md` (this file),
`docs/COMPLIANCE.md` (updated), `docs/DATA-SAFETY.md`, `docs/ENV.md`,
`docs/TEST-PLAN.md`, `docs/LAUNCH-CHECKLIST.md`.

## Open decisions (implemented as single points of change)

1. Support inbox: `SUPPORT_EMAIL` constant in `src/lib/support.ts`
   (already a constant; unchanged placeholder value, D1 in
   LAUNCH-CHECKLIST).
2. Stewardship badge RPC migration: committed as
   `20260804000100_discovery_stewardship.sql`, still unapplied to any
   hosted project by design; apply notes are D2 in LAUNCH-CHECKLIST. The
   client is presence-gated and needs no change either way.
