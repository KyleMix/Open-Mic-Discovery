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
- Verified live on a fresh database (not by reading code): all 71
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

## Post-pass owner decisions, applied same day

Asked and answered 2026-08-08 after the deliverables landed:

- D4: submit WITHOUT the web moderation console; the audited in-app path
  is the takedown mechanism, console comes after launch.
- D3: the web presence lives at `www.stonedgooseproductions.com/open-mics`. Sweep applied
  in one change: `app.json` associated domains and intent filter (host
  `www.stonedgooseproductions.com`, path `/open-mics/mic/`), `web/.well-known` AASA
  components, new `src/app/+native-intent.tsx` stripping the `/open-mics`
  prefix from incoming links, share URLs, legal link URLs, the support
  constant (`kyle@stonedgooseproductions.com`), the deletion page and Edge
  Function defaults, and EULA 1.3 (migration
  `20260808000200_eula_web_home.sql`, the two address lines only, with
  the eula pgTAP test extended; 708 assertions pass). The deploy target
  moved accordingly in DEPLOY_WEB.md and LAUNCH-CHECKLIST.md: association
  files at the domain root, app pages under `/open-mics/`.

## Correction, 2026-08-08 (found while writing the owner walkthrough)

Two things the pass got wrong and fixed:

- Migration count. BASELINE said 71 and the checklist said 72; the real
  numbers are 69 at baseline and 71 now. Corrected in both files. Nothing
  behavioral, but the owner counts these while running `db push`.
- Production seed. Phase 3's brief item "add a seed script that creates
  demo data for reviewers" was marked satisfied by `supabase/seed.sql`.
  It is not: that file's own header says never run it against production,
  because its passwords are published in `REVIEW_NOTES.md` and it writes
  two rows into the admin allowlist. `supabase/seed/` was empty. Added
  `supabase/seed/production-reviewer-seed.sql`: content only (8 venues, 10
  listings, all four signup methods, 4 owned by the reviewer producer),
  taking the two reviewer accounts by email after they are created through
  real app signup, refusing to run if either is missing, never touching
  `admin.admin_users` or `profiles.is_admin`, and idempotent. Verified on a
  fresh database: 10 listings, 103 future occurrences generated by the
  series trigger, roles set, zero admin rows written, clean re-run, and a
  named refusal for an unknown account. LAUNCH-CHECKLIST step 3 rewritten
  around it.

## Domain, final: www.stonedgooseproductions.com/open-mics

The owner supplied the real page URL after the first sweep, and it differs
in both host and path from the interim `stonedgoose.com/openmic`. Swept
again across 29 files: `app.json` (associated domain
`applinks:www.stonedgooseproductions.com`, intent filter host and
`/open-mics/mic/` prefix), the AASA components, `+native-intent.tsx`,
share and legal URLs, the deletion page, the Edge Function origin and page
defaults, `config.toml`, the reviewer seed example addresses, and every
doc.

Support and legal addresses moved to the same domain:
`kyle@stonedgooseproductions.com` and
`kyle@stonedgooseproductions.com`.

EULA 1.3 (`20260808000200_eula_web_home.sql`) was corrected in place rather
than superseded by a 1.4. The repo's rule is that published versions are
never rewritten because `profiles.eula_version` references them and they
are the exact text people accepted; that rule protects 1.0 through 1.2,
which are applied. 1.3 has never been applied to any hosted project (there
is no production project yet), so no one has accepted it and there is no
row referencing it. Shipping a 1.3 naming a URL that never existed, then a
1.4 correcting it, would have put a version in the acceptance history that
was wrong for its entire life.

Deep links stay fully enabled: the owner confirmed they control files at
the domain root, which is where `/.well-known/apple-app-site-association`
and `/.well-known/assetlinks.json` must be served (not under the
`/open-mics` subpath). Only the `www` host is declared, matching the
canonical URL and what share links emit; the apex should redirect to it.

Verified after the sweep: typecheck, lint, 493 Jest tests, 708 pgTAP
assertions on a rebuilt database (EULA 1.3 text confirmed by query),
prettier, and `expo prebuild`.

## Owner decisions on the website and launch data, 2026-08-08

Reading `KyleMix/stoned_goose_website` showed the premise of the website
work was wrong. The `/open-mics` page is already branded Open Mic Explorer
and already works: 85 real Pacific Northwest mic records in a Sveltia CMS
collection, a 147-row Google Sheet import as fallback, an interactive map,
a submit dialog, and schema.org markup. Its source even explains that it
publishes venue-name-only schema "until the freshness system lands", which
is the system this app already ships.

Owner decisions:

1. **The app launches empty.** Nothing is imported from the website. Mic
   owners add their own rooms once the app is live. No importer was built.
2. **Reviewers keep the fictional seed**, which is already built and
   verified.

Consequences handled here:

- Those two decisions are in tension for exactly one moment: the fictional
  seed is right for TestFlight and Play internal testing, and wrong for a
  public release, because The Rusty Fret and Blue Heron Coffee do not exist
  and a performer driving to one is real harm from fake data in a live
  product. Removal is now documented in the seed file's header (four
  statements, all keyed on the `5eed` id prefix that exists precisely so
  the seed never shares a namespace with real rows) and as step 11b of
  LAUNCH-CHECKLIST, gated on public release rather than on review.
- The website prompt was rewritten from "replace the finder" to "add the
  app to the page", with the app pitched to hosts rather than performers.
  On day one the map has 85 rooms and the app has none, so pitching the app
  as a better map would be false and would earn the review it deserves.
- `/open-mics/mic/<uuid>` deep links currently 404 on the website. The ids
  are Supabase uuids the website has no data for, and `output: "export"`
  cannot pre-render unknown params, so the prompt specifies a static
  landing page plus a `_redirects` splat rather than a dynamic route.
- Serving `/.well-known/apple-app-site-association` with the right content
  type is straightforward on that stack: it is a static export to
  Cloudflare Workers Static Assets, and `public/_headers` is already used
  to force a content type on extensionless OG image routes.

Not acted on, recorded because it is the obvious next lever: the website's
mic collection names 28 hosts and carries 7 distinct host email addresses.
That is the outreach list for the app's supply side, and it exists without
importing a single listing.

## Open decisions (implemented as single points of change)

1. Support inbox: `SUPPORT_EMAIL` constant in `src/lib/support.ts`
   (already a constant; now `kyle@stonedgooseproductions.com` per D3, and the
   inbox still needs creating, D1 in LAUNCH-CHECKLIST).
2. Stewardship badge RPC migration: committed as
   `20260804000100_discovery_stewardship.sql`, still unapplied to any
   hosted project by design; apply notes are D2 in LAUNCH-CHECKLIST. The
   client is presence-gated and needs no change either way.
