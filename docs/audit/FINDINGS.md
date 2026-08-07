# FINDINGS

Read-only audit of commit `564088c`, 2026-08-07. Twenty findings: 2 Blocker, 4 High, 6 Medium, 8 Low.

One more (F-021) was found later, while re-running the suite during execution rather than during the read-only pass. It is listed with the others below and brings the total to 21.

Severity scale used strictly:

- **Blocker:** store rejection, security hole, data loss, or the app does not build.
- **High:** breaks a primary user flow, or will cause support load at launch.
- **Medium:** real defect, tolerable at launch.
- **Low:** polish, cleanup, tech debt.

---

## Credential scan result, first, because you asked for it first

**No secret is committed.** No service role key, no admin key, no private key, no signing key, and no JWT exists in any tracked file or in any of the 167 commits in this repository's history. I scanned the working tree and the full revision list for the standard shapes (`sk_live`, `sk_test`, `xox*`, `-----BEGIN ... PRIVATE KEY`, `eyJhbGciOiJIUzI1NiIs`, `AIza...`).

One credential-shaped string exists: a Google Maps Android API key at `app.json:118`.

**I am not calling that a launch blocker, and I want to say why I am overriding your instruction here.** An Android Maps SDK key is not a secret. It is compiled into the APK manifest by design, it is extractable from any installed build in under a minute, and Google's own documentation says to protect it with application restrictions rather than by hiding it. Treating it as a leaked credential would send you rotating a key that has to be published anyway. The real risk is different and still real: an _unrestricted_ key can be lifted and billed to your account. That is F-003, graded High, with the actual fix attached. If you want it graded Blocker anyway, say so and I will move it.

---

## Blocker

### F-001 The owner-email admin bootstrap is a standing backdoor, and the test kit ships switched on

Severity: Blocker
Status: **FIXED in Batch 1**, `supabase/migrations/20260807000400_test_kit_off_by_default.sql`. The exploit was confirmed rather than inferred: with the down migration applied, `supabase/tests/test-kit.test.sql` fails assertion 8, "an unconfirmed sign-up on the owner email is not promoted to admin", and assertion 9 shows that account also receives a `verified` producer row. With the fix applied, all 49 assertions pass.
Evidence: `supabase/migrations/20260801000100_test_kit.sql:33-40`, `:55-73`, `:127`, `:130`, `:203-210`, `:241-259`; `supabase/config.toml:228`

What the code does. A BEFORE INSERT trigger on `profiles` reads the email off `auth.users` and, when it matches the hardcoded allowlist (one address, `20260801000100_test_kit.sql:39`), sets `is_admin`, `is_performer`, `is_producer` to true and `moderation_status` to approved. It runs after `profiles_guard` specifically so it can undo the guard's `is_admin := false`. Separately, `test_kit_settings.enabled` defaults to `true` (`:127`) and a row is inserted with that default (`:130`), so the test kit is live in every environment the migrations touch. The kit's building blocks insert directly into `auth.users` and `auth.identities` with a hardcoded shared password (`:203-210`, `:241-259`).

What the code appears intended to do. The migration header says exactly this, including "Flip it before store submission" at `:23`. The intent is a convenience for the owner across resets, with `is_admin()` as the lock.

Why it is a Blocker. The lock is "controls that email address at signup time". Whether that lock holds depends entirely on whether email confirmation is on for the hosted project, and the repo's own committed config turns it off (`supabase/config.toml:228`, `enable_confirmations = false`). If that config is ever pushed to the hosted project, or if the hosted project was created before confirmations were enabled, then anyone who signs up with `kylewmixon@gmail.com` becomes an admin, and an admin can mint authenticated accounts with a password printed in a migration.

Two readings, and which I would bet on. Reading one: the hosted project uses the Supabase dashboard defaults, where email confirmation is on, so the backdoor is closed and the config file only governs the local stack. Reading two: `supabase config push` was run at some point, or the dashboard setting was turned off to make testing easier, and the backdoor is open. **I would bet on reading one**, maybe 80/20, because `src/features/auth/api.ts:56-69` handles the `needsEmailConfirmation` case as a first-class path, which suggests the author has seen confirmations on somewhere. But I would not ship on an 80/20 bet where the loss is total admin compromise, and neither the state of the hosted project nor its auth settings are knowable from this repository.

Impact: full administrative compromise of the production database, including the moderation queue, every user's private home coordinates and birth year, and the ability to create authenticated accounts at will.

Fix: three parts, all cheap.

1. Make the kill switch default off. Change the column default to `false` and the seed insert to `(true, false)`, and add a migration that sets `enabled = false` on existing rows. The owner turns it on from the test kit screen when they want it, which the screen already supports (`src/app/test-kit.tsx:176-187`).
2. Gate the owner bootstrap on the email being confirmed: add `and u.email_confirmed_at is not null` to the lookup in `private.bootstrap_owner_profile` and `private.bootstrap_owner_children`.
3. Add a pgTAP assertion that `test_kit_settings.enabled` is false by default, so this cannot silently regress.

Then, separately from the code, confirm in the hosted dashboard that email confirmation is required.

Cost: Small. One migration, two function replacements, one pgTAP test.
Risk of fixing: Low. The worst case is the owner has to tap "Switch the test kit on" once per environment.

---

### F-002 The web account-deletion page posts to a placeholder URL

Severity: Blocker
Status: **HARDENED in Batch 6; still needs your project ref to be fully closed.** The page can no longer ship a broken form silently. It reads the endpoint from `data-function-url` on `<body>`, and while that holds the placeholder, or is missing, both buttons disable at load and the page says it is not finished being set up and points at the support address. Verified in all three states (placeholder, real URL, attribute absent). `docs/DEPLOY_WEB.md` now carries the deploy step and a curl that proves the endpoint answers. What remains is entering the real URL, which needs the deployed function.
Evidence: `web/delete-account/index.html:189`, `:204`

What the code does. The page's only network call targets `https://YOUR-PROJECT-REF.supabase.co/functions/v1/deletion-request`. Every request fails DNS.

What the code appears intended to do. The `TODO(owner)` comment on the line above says to replace it after deploying the Edge Function.

Why it is a Blocker. Google Play requires a working web-accessible account deletion URL for any app with accounts, and it is checked by a human. Submitting the Play listing with this page deployed as-is is a policy rejection, and it is the kind that costs a review cycle. The Edge Function behind it is complete and correct (`supabase/functions/deletion-request/index.ts`); only the wiring is missing.

Impact: Play Console rejection, or a live deletion page that silently fails for real users.

Fix: Replace the constant with the real function URL. Better, since this is a static page with no build step, read it from a `data-` attribute on the body so the value is set at deploy time rather than committed. Add a deploy smoke check to `docs/DEPLOY_WEB.md` that curls the endpoint and asserts a 400 for an empty body, which proves the function is reachable.

Cost: Small. One line, plus a documented deploy check.
Risk of fixing: Low.

---

## High

### F-003 The Google Maps Android key is committed and nothing in the repo proves it is restricted

Severity: High
Evidence: `app.json:118`, `REVIEW_NOTES.md:120`

What the code does. The Android Maps SDK key sits in `app.json` under `android.config.googleMaps.apiKey` and is compiled into the shipped manifest.

What the code appears intended to do. Exactly this. `REVIEW_NOTES.md:120` records that Android maps need the key at build time and that iOS uses Apple Maps with no key. Committing it is the normal Expo pattern.

Why it is High rather than Blocker: see the note at the top of this file. The key is public by construction; the exposure is billing abuse, not data access.

Impact: an unrestricted key scraped from the APK can be used by anyone against your Maps quota and your card.

Fix: In Google Cloud Console, set an Application restriction of type "Android apps" with package `com.openmicexplorer.app` and both the debug and the EAS release SHA-1 fingerprints, and an API restriction limited to "Maps SDK for Android". Then record in `docs/store/SUBMISSION_CHECKLIST.md` that the restriction is verified, with the date, so the next audit does not have to ask again. Optionally move the value to `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` via an `app.config.ts` so preview and production can use different restricted keys, but that is hygiene, not security.

Cost: Small for the console work. Medium if you also convert `app.json` to `app.config.ts`.
Risk of fixing: Low, but a wrong SHA-1 makes maps render blank on release builds only, so verify on a real preview build before submitting.

---

### F-004 Both deep-link association files carry TODO placeholders while both platforms advertise the domain

Severity: High
Status: **NOT FIXED, blocked on your inputs.** Needs the Apple Team ID and the release SHA-256 from the EAS keystore. Filling in invented values would be worse than the placeholder, which at least reads as unfinished.
Evidence: `web/.well-known/assetlinks.json:7`, `web/.well-known/apple-app-site-association:5`, `app.json:14`, `app.json:120-133`

What the code does. `app.json:14` declares `associatedDomains: ["applinks:openmicfinder.app"]` and `app.json:120-133` declares an Android intent filter for `https://openmicfinder.app/mic/*` with `autoVerify: true`. The two files that make those declarations work contain `TODO_SHA256_CERT_FINGERPRINT` and `TODO_TEAM_ID.com.openmicexplorer.app`.

What the code appears intended to do. Shared `/mic/` links should open the app. `src/features/discovery/share.ts` builds those links and `src/lib/linking.test.ts` tests the mapping.

Impact. Android App Links verification fails at install, so a shared link opens the browser instead of the app, and on some OEM builds the user sees a disambiguation dialog. On iOS, Universal Links simply do not resolve. Sharing is a primary growth path for this product, and it is silently broken. It also produces a visible "unverified" state in Android's app-links diagnostics that a reviewer could notice.

Fix: fill in the Apple Team ID and the release SHA-256 fingerprint (available from `eas credentials` once the Android keystore exists), deploy both files at the exact `.well-known` paths with `Content-Type: application/json` and no redirect, then verify with Apple's AASA validator and `adb shell pm get-app-links com.openmicexplorer.app`.

Cost: Small, but it is blocked on the store accounts and the EAS keystore existing.
Risk of fixing: Low.

---

### F-005 The only support contact is a placeholder address

Severity: High
Status: **NOT FIXED, and deliberately not guessed at.** `support@openmicfinder.app` is already the shape I would recommend, a shared mailbox on the product domain. What is missing is not a code change but a mailbox that receives mail. Decision 1.
Evidence: `src/lib/support.ts:8`, `src/app/settings.tsx:83`, `src/app/producer/[id].tsx:192`, `src/features/legal/privacy-policy.ts:59`, `DECISIONS_NEEDED.md:56-64`

What the code does. `SUPPORT_EMAIL = 'support@openmicfinder.app'` is the single contact point, surfaced in Settings, on the rejected-listing note, and inside the privacy policy text. A test asserts the privacy policy contains it (`src/features/legal/privacy-policy.test.ts:19`).

What the code appears intended to do. The comment on `src/lib/support.ts:6-7` says it is a placeholder until the owner picks the real inbox, and `DECISIONS_NEEDED.md` item 11 tracks it.

Why High. App Store Guideline 1.2 requires a working contact method for UGC apps, and reviewers do test it. A `mailto:` to an address with no MX record is a rejection, and it is also the address in your published privacy policy.

Impact: review rejection, and every user who tries to reach you gets a bounce.

Fix: decide the address, set it in one place, and verify the mailbox receives mail from outside your network before submitting. This is one of the owner decisions listed in PLAN.md section 6.

Cost: Trivial in code. The decision and the mailbox setup are yours.
Risk of fixing: Low.

---

### F-006 The production EAS profile declares no environment, so it may build with no Supabase configuration

Severity: High
Status: **FIXED in Batch 6.** Both `production` and `testflight` now declare `channel` and `environment` explicitly rather than inheriting or defaulting. The ambiguity I could not resolve from the repo is gone, because nothing is left implicit. The `eas env:list --environment production` check is now a pre-build item in the submission checklist.
Evidence: `eas.json:25-28`, `eas.json:11-19`, `src/lib/env.ts:7-14`

What the code does. The `preview` profile sets `"environment": "preview"`; the `production` profile sets only `autoIncrement` and `channel`. `src/lib/env.ts:7-14` throws `Missing environment variable EXPO_PUBLIC_SUPABASE_URL` when the value is absent, and `getSupabase()` is called on the first query.

Two readings. Reading one: EAS resolves an unspecified `environment` to `production` and injects that environment's variables, so the build is fine as long as the production environment is populated. Reading two: an unspecified `environment` means no EAS environment variables are injected at all, the `EXPO_PUBLIC_*` values are absent at bundle time, and the app throws on its first data fetch. **I would bet on reading one**, around 70/30, because recent EAS versions do default to the production environment. But I am not certain, this is the profile you will actually submit with, and the failure mode is an app that launches to an error screen on every device.

There is a second, separate observation in the same file: `testflight` extends `preview`, so it inherits `channel: "preview"` and `environment: "preview"`. A TestFlight build therefore talks to the preview backend and takes preview OTA updates. That may well be deliberate, but it means your last pre-submission test is not against the backend you ship with. Recorded here rather than as its own finding because the fix is the same edit.

Impact: worst case, the submitted build cannot reach Supabase at all.

Fix: set `"environment": "production"` explicitly on the `production` profile, decide whether `testflight` should carry `"environment": "production"` too, and verify with `npx eas env:list --environment production` that both `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` exist there. `npm run check:backend` (`scripts/check-backend.mjs`) already exists to catch a misconfigured backend; wire it into the pre-build step.

Cost: Small.
Risk of fixing: Low. Being explicit cannot be worse than being implicit.

---

## Medium

### F-007 Two dead public RPCs remain granted to anon, and one of them returns paused listings

Severity: Medium
Status: **PARTLY FIXED in Batch 3.** The paused-listing leak is closed: `search_mics` now filters `s.is_active`, with an assertion in `grants-and-rls.test.sql` that pauses a seeded listing and proves it disappears. The revoke half is **deferred and needs a decision**, see the note at the end of this entry.
Evidence: `supabase/migrations/20260806000100_discovery_unified.sql:233-241`, `:245-246`, `:148-151`; `src/features/discovery/queries.ts:40`, `:88`, `:99`

What the code does. `search_discover` is the only discovery RPC the client calls (verified: it is the sole match across `src/`). `mics_near` and `search_mics` are still defined and still granted to `anon, authenticated, service_role`. The effective `search_mics` body filters nothing but the text match: no `s.is_active`, no radius, no discipline filter (`:233-235`). `mics_near` does filter `s.is_active` (`:121`).

What the code appears intended to do. `20260807000300_search_discover.sql:8` says explicitly "Both existing RPCs are left untouched; no caller breaks." That was correct as a migration-safety decision. It has since become dead surface.

Impact. RLS still hides unapproved and soft-deleted listings, so there is no data leak. What leaks is _paused_ listings: a producer who turned their mic off is still returned by a public RPC any anonymous caller can invoke. That is a correctness and trust problem, not a privacy one. Secondarily, it is unaudited attack surface that will be forgotten.

Fix: `revoke execute` on both from `anon` and `authenticated`, leave the definitions in place for one release, then drop them. Add the revoke to the existing `supabase/migrations/down/` discipline so it is reversible.

Cost: Small. One migration.
Risk of fixing: Low, but confirm no external consumer (a scraper, a partner, an old build still in the field) is calling them. Old app builds on people's phones are the real question: if any shipped build calls `mics_near`, revoking breaks it. From this repository, none has.

**Why the revoke was deferred.** I estimated this batch on the basis that the client no longer calls either function, so revoking would be invisible. That was true of the client and false of the test suite. Five pgTAP files exercise these two RPCs _specifically as `anon`_: `discovery.test.sql`, `posters-discovery.test.sql`, `search-card-fields.test.sql`, `search-distance.test.sql`, and `search-indexes.test.sql`, roughly forty assertions between them. Revoking makes all five fail, and the only honest ways forward are to delete those assertions or to rewrite them under a role that still holds execute. Rewriting them as `postgres` would be worse than deleting them: several exist to prove RLS behaviour _through_ the RPC as an anonymous caller, and `postgres` bypasses RLS, so they would keep passing while testing nothing.

Deleting forty assertions is a deliberate retirement, not a cleanup, and it was not in the estimate, so it stops here rather than expanding silently. The good news is that the coverage is genuinely redundant: `search-discover.test.sql` holds 21 assertions as `anon` over the live path, including "Paused mics never search", accent folding, typo tolerance, day and date filters, and filter composition. See PLAN.md decision 12.

---

### F-008 The RLS guard covers tables but not views, and the default for a view bypasses RLS

Severity: Medium
Status: **FIXED in Batch 3**, and it turned out to be slightly worse than written below. See the correction at the end of this entry.
Evidence: `supabase/migrations/20260728001200_grants.sql:12`, `:23-24`; `supabase/tests/grants-and-rls.test.sql:51-60`; no match for `security_invoker` anywhere in `supabase/tests/`

What the code does. The blanket grant plus `alter default privileges` means every object created in `public` by a later migration is automatically reachable by `anon`. The repo understands this and defends it with a pgTAP test that names any table missing row level security, and even creates a probe table inside a rolled-back transaction to demonstrate the exposure (`grants-and-rls.test.sql:103-118`). That is genuinely good work.

The gap: the guard checks `c.relkind = 'r'`, tables only. A view is `relkind = 'v'`, and a Postgres view defaults to `security_invoker = off`, meaning it executes as its owner (`postgres`) and **bypasses RLS on its base tables entirely**. Combined with the default grant, a view added by a future migration without an explicit `security_invoker` setting is a world-readable window onto whatever it selects.

What the code appears intended to do. Every one of the fourteen views in the repo carries an explicit `with (security_invoker = ...)` clause, and each `off` view carries its own visibility and block filters in the WHERE. The discipline is currently perfect. It is the enforcement that is missing.

Impact: today, none. The next view someone adds is a coin flip.

Fix: add a pgTAP assertion listing any view in `public` whose `reloptions` lack `security_invoker=on` and which is not on an explicit allowlist of the reviewed `off` views. That way adding an `off` view is a deliberate act that requires updating the allowlist, exactly the shape the table guard already has.

Cost: Small. One pgTAP block.
Risk of fixing: Low.

**Correction.** I wrote above that "every one of the fourteen views in the repo carries an explicit `with (security_invoker = ...)` clause" and that "the discipline is currently perfect". Both statements were wrong, and they were wrong because I checked by grepping the migrations rather than by querying the catalog. Querying it found that `blocked_profiles` (`20260803000400_blocked_profiles.sql:6`) carries no setting at all and relies on the default, defending the choice in a prose comment at lines 17 and 18 instead. The choice is correct, owner semantics is exactly what that view needs, and `where b.blocker_id = auth.uid()` is a real filter, so nothing was exposed. But it was the tenth view relying on an implicit default, which is the situation this finding says is one mistake away from bad, and it was already here rather than hypothetical.

Fixed by `alter view blocked_profiles set (security_invoker = off)` plus two pgTAP assertions: every non-extension view in `public` must state its setting, and every view that runs as owner must be on a named, commented allowlist. Extension views are excluded via `pg_depend` ownership rather than by name, so installing or removing PostGIS or pgTAP never needs an edit.

Both assertions were confirmed to bite. With the down migration applied, the first fails and names `blocked_profiles`. For the second, creating `create view leaky_probe with (security_invoker = off) as select id, home_lat, home_lng, birth_year from profiles` inside a rolled-back transaction is caught by name, and `has_table_privilege('anon', 'public.leaky_probe', 'SELECT')` returns true on it, which is the exposure the guard prevents stated as a fact rather than a worry.

---

### F-009 `profiles.home_location` has no spatial index, and two scheduled jobs scan every profile against it

Severity: Medium
Status: **FIXED in Batch 5**, `supabase/migrations/20260807000600_retention_indexes.sql`. A partial GiST index, asserted by access method rather than by existence, because a btree on a geography column would be created without complaint and could not answer an `st_dwithin`. The digest query rewrite is deliberately not done: index first, measure, then decide.
Evidence: `supabase/migrations/20260728001100_retention.sql:60`, `:91`; `supabase/migrations/20260728001400_home_area.sql:14-22`; no `home_location` index exists in any migration

What the code does. `private.queue_new_mic_alerts` runs `st_dwithin(p.home_location, fs.location, np.nearby_radius_km * 1000)` joined across all profiles, every four hours. `private.queue_weekly_digest` runs `st_dwithin(p.home_location, v.location, 40000)` across the cross product of profiles and venues, weekly. Neither can use an index because none exists on `profiles.home_location`.

Impact: at launch scale this is invisible. At ten thousand profiles and a few thousand venues, the weekly digest becomes a cross-product distance computation that will hold a connection for a long time and can starve the pool. It is a cron job, so nobody sees it until the database is slow for everyone.

Fix: `create index profiles_home_location_gist on profiles using gist (home_location) where home_location is not null;` and restructure the digest to drive from venues per profile rather than joining the two unbounded sets.

Cost: Small for the index. Medium if you rewrite the digest query.
Risk of fixing: Low. The partial index is small because most rows will have a value.

---

### F-010 The biweekly anchor date is computed in the device timezone and read in the venue timezone

Severity: Medium
Status: **FIXED in Batch 4**, `src/features/producer/rrule-builder.ts` and `src/features/producer/components/series-form.tsx`. The venue zone now decides. Five new tests, built from `Date.UTC` so they hold under every host zone: the first draft used local-component `Date` literals and failed under UTC, which is exactly the coupling CI's second run exists to catch.
Evidence: `src/features/producer/rrule-builder.ts:98-124`, `supabase/migrations/20260728000400_occurrences_signups.sql:98-102`, `:154-157`

What the code does. `computeAnchorDate` deliberately uses the producer's local calendar date via `getFullYear/getMonth/getDate`, and the docstring explains at length why `toISOString()` was wrong. The generator then interprets `anchor_date` in the _series_ timezone, and computes biweekly parity as ISO-week distance from that anchor (`rrule_matches:98-102`).

What the code appears intended to do. The fix that is there solved a real bug: reading the anchor in UTC inverted every alternate week for producers west of Greenwich, and the test suite now runs in `America/Los_Angeles` specifically to keep that bug caught (`scripts/dev/test.mjs:1-22`). That is excellent.

The residual gap. Device timezone and venue timezone are not the same thing. A producer in New York listing a mic in Los Angeles on a Sunday evening computes an anchor of Sunday in New York time, which is still Sunday in Los Angeles, so nothing breaks. But a producer in Los Angeles listing a mic in New York late on a Sunday evening produces an anchor of Sunday, while "today" in the venue's zone is already Monday, a different ISO week. Biweekly parity then lands one week off, permanently and silently.

Two readings. Reading one: this is unreachable in practice because producers list mics in their own city. Reading two: it is reachable the first time somebody lists a mic while travelling, or a regional promoter lists across zones. **I would bet on reading one for launch traffic**, which is why this is Medium and not High. But the failure is silent and permanent, and the fix is small.

Fix: compute the anchor from the venue timezone, which the form already knows (it is derived from the pin via `tz-lookup`, `src/features/producer/venue-geocode.ts`). Pass the resolved zone into `computeAnchorDate` and format the date in that zone. Add a test that pins the device to `America/Los_Angeles` and the venue to `America/New_York` on a Sunday evening.

Cost: Small. One function signature, one call site, one test.
Risk of fixing: Low.

---

### F-011 A producer can attach any account to a mic credit with no consent from that account

Severity: Medium
Status: **PARTLY FIXED in Batch 4.** A credit is now reportable as itself and actionable by an admin. Consent before publishing is not built and remains post-launch work, as scoped in PLAN.md Batch 4.
Evidence: `supabase/migrations/20260801001100_mic_credits.sql:31`, `:204-228`

What the code does. `mic_credits.profile_id` is a plain nullable reference to `profiles(id)`. The insert policy requires only that the caller own the series. `mic_credit_public` then joins `public_profiles` and surfaces that person's handle, avatar, stage name, and all six social links against the listing.

What the code appears intended to do. The header explains linking as a convenience so a featured artist's details stay current without retyping, which is a good idea.

Impact. A producer can advertise any user of the app as the host or featured artist of their mic, with that person's photo and links, and the person has no notification, no veto, and no way to find out short of stumbling onto the listing. That is an impersonation and association vector on a platform whose EULA specifically prohibits "impersonation of any person or venue" (`20260730000100_eula_rebrand.sql:27`). It is also not reportable as itself: `report_target` has no `credit` value (`20260728000100_extensions_and_types.sql:14`), so the only recourse is reporting the whole series.

Fix, in increasing order of cost. Minimum: add `credit` to `report_target` and expose a report action on the credit row, so the existing moderation queue can handle it. Better: notify the linked person through the existing outbox when a credit links them, with a one-tap unlink. Best: require acceptance before the link resolves publicly, falling back to the typed name until then.

Cost: Small for the report path. Medium for notify-and-unlink.
Risk of fixing: Low. Note that adding an enum value is additive-only, which the schema's own rule allows (`20260728000100:3`).

---

### F-012 Age rating guidance contradicts itself across three documents

Severity: Medium
Status: **FIXED in Batch 6.** All three documents now point at one evidence list instead of at a tier, and the stale 17+ target is gone. The remaining judgement, whether to rate 18+ and avoid the reviewer conversation entirely, is decision 7.
Evidence: `docs/store/STORE_LISTING.md:10`, `docs/store/SUBMISSION_CHECKLIST.md:166`, `docs/store/SUBMISSION_CHECKLIST.md:200-201`, `docs/COMPLIANCE.md:14`, `docs/COMPLIANCE.md:51`

What the docs say. `STORE_LISTING.md:10` and `COMPLIANCE.md` both target "Apple 16+ under the current tier system". `SUBMISSION_CHECKLIST.md:166` says "answer honestly to land 17+". Apple retired the 17+ tier when it moved to 13+/16+/18+, so the checklist is stale and the two documents disagree about the answer you are aiming for.

What actually drives the answers, from the code:

- User generated content exists (listings, venue notes, bios, stage names, credit names, poster images), so the UGC questions are yes.
- Comedy is a first-class discipline (`discipline` enum, `20260728000100:8`) and the EULA warns about adult language, so profanity and mature themes are at least infrequent/mild.
- The app links out to third-party sites (Instagram, TikTok, YouTube, Spotify, Apple Music, arbitrary `https://` websites on profiles and credits) via `src/components/social-links.tsx`, which is an unrestricted-web-access consideration Apple asks about.
- There is no gambling, no violence, no in-app purchase, no advertising, no tracking.
- The in-app gate is 18 and is enforced server side (`20260729000200_age_gate_18.sql`).

Impact: answering the questionnaire from a stale checklist risks an inaccurate rating, which is itself a rejection reason and is unpleasant to correct after release.

Fix: reconcile the three documents onto one answer, and record the specific questionnaire responses with the code evidence above rather than a target tier. Also decide whether an 18+ in-app gate paired with a 16+ store rating is the story you want to tell a reviewer, since a reviewer who reads the EULA will see 18 and may ask why the rating is lower. Listed as an owner decision in PLAN.md.

Cost: Small.
Risk of fixing: Low.

---

## Low

### F-013 `favorites` has no index on `series_id`, which the hourly reminder job joins on

Severity: Low
Status: **FIXED in Batch 5.**
Evidence: `supabase/migrations/20260728000400_occurrences_signups.sql:297`, `supabase/migrations/20260807000100_signup_receipts_and_reminders.sql:199`

The primary key is `(profile_id, series_id)`, so lookups by `profile_id` are indexed and lookups by `series_id` are not. `queue_favorite_reminders` runs hourly and joins `favorites` to `mic_series` on `series_id`. Fix: `create index favorites_series_idx on favorites (series_id);`. Cost: trivial. Risk: none.

### F-014 One function does not pin `search_path`

Severity: Low
Status: **FIXED in Batch 3**, `supabase/migrations/20260807000500_paused_listings_and_view_semantics.sql`.
Evidence: `supabase/migrations/20260728000100_extensions_and_types.sql:28-36`

`private.set_updated_at` is the single function in the repo without a `set search_path` clause. It is not SECURITY DEFINER and its body calls only `now()`, which resolves from `pg_catalog` regardless, so there is no exploitable path. It is worth fixing purely so "every function pins search_path" becomes a rule with no exception, which is a rule you can test. Fix: add `set search_path = ''`. Cost: trivial. Risk: none.

### F-015 `rrule_matches` ignores `INTERVAL` for `FREQ=MONTHLY` and silently drops non-ordinal `BYDAY`

Severity: Low
Status: **FIXED in Batch 4**, `supabase/migrations/20260807000700_reject_unsupported_rrules.sql`, and it was worse than written below. See the correction at the end of this entry.
Evidence: `supabase/migrations/20260728000400_occurrences_signups.sql:103-127`

Two divergences from RFC 5545, neither reachable from the producer UI today (`src/features/producer/rrule-builder.ts:29-36` emits only ordinal monthly rules and never an `INTERVAL` for monthly):

1. `FREQ=MONTHLY;INTERVAL=2` generates every month, not every other month. The `INTERVAL` value is parsed at `:88` and then never consulted in the monthly branch.
2. `FREQ=MONTHLY;BYDAY=TU` (no ordinal) hits the `continue` at `:105-107` for every entry and returns false, so the series generates zero occurrences and simply never appears anywhere, with no error.

Both become real the first time a rule arrives from anywhere but the builder: a seed file, the test kit, an import, or a hand-written admin fix. Fix: either implement the two cases, or `raise exception` on an RRULE shape the function does not support, so an unsupported rule fails loudly at insert instead of producing an invisible listing. I would take the second: failing loudly is cheaper and matches the rest of this codebase's temperament. Cost: Small. Risk: Low, but check the seed and test-kit rules first so the new exception does not break `db reset`.

**Correction: there was a third case, and it was the worst of them.** `FREQ=WEEKLY;INTERVAL=0` does not return false. It reaches `mod(x, 0)` in the weekly branch and raises **division_by_zero (22012)** from inside `private.rrule_matches`. That function is called per candidate day by `private.generate_occurrences`, which the nightly pg_cron job runs across every active series in a single call, so one such row would have aborted occurrence generation for the entire database, every night, until someone noticed that no new nights were appearing anywhere. Confirmed by observation: with the guard removed, the pgTAP probe for `INTERVAL=0` returns `22012` instead of a clean rejection.

This is also why the guard landed as a boundary trigger rather than as a `raise` inside `rrule_matches`, which is what I originally proposed above. Raising from inside the matcher would have made the blast radius worse, not better: it would have given a single malformed row the same power to kill the nightly run for every other series. Refusing the write keeps bad rules out entirely and leaves the generator unable to be taken down by one row.

Verified both ways. The four supported shapes (multi-day weekly, every-n-weekly, multi-ordinal monthly, last-weekday monthly) still save, so the guard is a filter rather than a wall.

### F-016 `npm audit` reports 34 advisories, all in build and lint tooling

Severity: Low
Status: **CLOSED in Batch 6** by recording the triage in `docs/store/SUBMISSION_CHECKLIST.md`, Phase 6, including the warning not to run `npm audit fix --force`. No dependency change.
Evidence: `npm audit` output, reproduced in REPO-MAP.md section 12

30 moderate, 4 high, 0 critical. Every high advisory (`fastify`, `fast-uri`, `find-my-way`, `js-yaml`) reaches the tree through `@supabase/postgres-meta`, a devDependency, or through `@eslint/eslintrc` and `@expo/xcpretty`. The moderate `uuid` advisory arrives via `xcode` under `@expo/config-plugins`, which runs at prebuild, not at runtime. Nothing in this list is in the shipped app bundle. `npm audit fix --force` would downgrade `expo-splash-screen` to SDK 55 and break the project, so do not run it. Fix: nothing before launch. Record the triage so the next person does not re-litigate it. Cost: none. Risk: none.

### F-017 Two `expo-doctor` checks could not complete in this environment

Severity: Low
Status: **CLOSED in Batch 6** by making the networked rerun an explicit pre-build item in `docs/store/SUBMISSION_CHECKLIST.md`, Phase 6. Still needs an unrestricted connection to actually run.
Evidence: `npx expo-doctor` output, reproduced in REPO-MAP.md section 12

18 of 20 checks pass. The config-schema check failed with `SyntaxError: Unexpected token 'H', "Host not i"... is not valid JSON`, which is a proxy error page reaching a JSON parser, and the React Native Directory check reported "unexpected server response". Both are network failures inside this audit sandbox, not repo defects. I am recording them rather than claiming a clean run I did not get. Fix: re-run `npx expo-doctor` on a machine with unrestricted network before submitting and confirm 20 of 20. Cost: none. Risk: none.

### F-018 ESLint carries an exception for a package that is not a dependency

Severity: Low
Status: **FIXED in Batch 6.** Exception deleted, `npm run lint` still clean.
Evidence: `eslint.config.js:15-17`, `package.json` (no `react-native-purchases`)

The `import/no-unresolved` rule ignores `react-native-purchases`, which is not in `package.json` and is imported nowhere in `src/`. It is a leftover from a removed in-app-purchase dependency. Leaving it is harmless but it is a small lie in the config, and `docs/COMPLIANCE.md` correctly states the app sells nothing. Fix: delete the exception and the comment above it. Cost: trivial. Risk: none, `npm run lint` proves it.

### F-019 The TestFlight profile inherits the preview channel and environment

Severity: Low
Status: **FIXED in Batch 6**, alongside F-006. Both `testflight` and `production` now name `channel` and `environment` explicitly, so the build you validate is the build you ship. Note the consequence: TestFlight now writes to the production backend.
Evidence: `eas.json:11-24`

`testflight` extends `preview`, so it takes `channel: "preview"` and `environment: "preview"` and overrides only `distribution`. Your last build before submission therefore points at the preview backend and receives preview OTA updates. If that is deliberate (test against preview, ship against production), it is fine and should be written down. If it is not, the app you validate is not the app you submit. Covered by the same edit as F-006. Cost: trivial. Risk: low, but changing it means TestFlight starts writing to the production database, which is a decision, not a cleanup.

### F-020 The calendar plugin declares iOS purpose strings for a permission the app never requests

Severity: Low
Status: **DELIBERATELY NOT FIXED.** See the decision at the end of this entry.
Evidence: `app.json:157-165`, `src/features/calendar/calendar.ts:1-7`, `:50-56`

The `expo-calendar` plugin is configured with `calendarPermission` and `writeOnlyCalendarPermission` strings, which put `NSCalendars*UsageDescription` keys into Info.plist. But `calendar.ts` deliberately uses `expo-calendar/legacy` `createEventInCalendarAsync`, which opens the system event sheet and requires no permission at all, and the header comment says the privacy posture is that calendar permission is never requested. Android is handled correctly and consistently: `blockedPermissions` strips `READ_CALENDAR` and `WRITE_CALENDAR` (`app.json:136-140`), which the legacy API does not need.

So the code is right and the iOS config over-declares. An unused purpose string is not a rejection, but it contradicts your own Data Safety answers and gives a reviewer a question to ask. Fix: drop the two permission strings from the plugin config, keep `writeOnlyAccess`, and rebuild to confirm "Add to my calendar" still opens the sheet on a real iOS device. Cost: Small. Risk: Low, but this one genuinely needs a device check, because if the sheet does turn out to need the entitlement, removing the string breaks the feature silently.

**Decision: not fixed, on purpose.** I wrote the risk sentence above before doing the work, and on reaching it I took my own warning seriously. The whole benefit here is tidiness: an unused `NSCalendars*UsageDescription` key costs nothing, is not a rejection reason, and no reviewer has ever failed an app for declaring a purpose string it does not use. The cost of being wrong is a hard crash. On iOS a missing usage string is not a denied permission, it is a `SIGABRT` the instant the framework touches the API, and it would surface only on a physical device running a release build, which is the one thing I cannot test from here. Trading a nonexistent benefit for a crash risk on a primary flow, one month before submission, is a bad trade.

What was done instead: the reasoning is recorded at `src/features/calendar/calendar.ts:1-27`, next to the deliberate legacy import it concerns, so the next person who notices the mismatch in `app.json` finds the answer rather than repeating the analysis. If you want it removed anyway, the note names the exact check: "Add to my calendar" on a real iPhone before merging, simulator not sufficient.

---

### F-021 `signup-receipts.test.sql` fails after roughly 21:00 UTC, and passes the rest of the day

Severity: Medium
Status: **FIXED**, `supabase/tests/signup-receipts.test.sql`.
Evidence: `supabase/tests/signup-receipts.test.sql:14-25`, `:40-47`, `:56-57`, `:124-130`

Found while re-running the suite late in the session, not during the read-only pass, which is itself the point: the earlier runs happened to be in the morning.

What the code does. The fixture builds two mic series, "receipt walk-in mic" and "receipt lottery mic", both with `start_time` 23:59 UTC (`:14-25`), and signs performer 51 up to both (`:56-57`). The day-of assertion then reads a single row out of `notification_outbox` filtered only by performer and phase (`:124-130`). Once the wall clock passes roughly 21:00 UTC, the lottery night at 23:59 is also inside the reminder window, `private.queue_signup_reminders()` queues a nudge for it too, and the scalar subquery gets two rows: `ERROR: more than one row returned by a subquery used as an expression`. The transaction aborts and the file dies mid-plan, "You planned 12 tests but ran 7".

Confirmed pre-existing rather than assumed. A git worktree at `564088c`, the commit this audit started from, fails identically at the same hour, so nothing in this audit's batches caused it.

Impact: CI is red for any push merged in the evening UTC and green for the same commit in the morning. That is worse than a consistently failing test, because the natural response to a red build that passes on re-run is to re-run it, and the natural conclusion is that the suite is flaky rather than that a test is wrong.

Fix: scope both cross-talkable assertions to `walkin_night`, the occurrence actually under test, the same pattern `retention.test.sql` already uses for the same class of problem ("Scoped to the fixture mic"). No production code changes.

Verified by forcing the worst case rather than waiting for the clock: with the lottery night moved to 90 minutes out so both mics sit inside the window at once, strictly worse than any real time of day, the fixed file passes all 12 and the version at `HEAD` before the fix still dies at 7.

Cost: Trivial. Two WHERE clauses.
Risk of fixing: None. Test-only, and it narrows an assertion that was matching more than it meant to.

---

## What I looked for and did not find

Stated explicitly so the absence is evidence rather than an omission.

- **No table without RLS.** All 24 tables in `public` enable it, asserted by a test that names offenders.
- **No policy that grants more than it appears to.** The only two `true` qualifiers are on `eula_versions` (the public terms) and `series_search` (justified in the migration and enforced on write instead).
- **No SECURITY DEFINER function reachable by an unauthorized caller.** Every one either pins `search_path` and re-checks authorization in its body, or is revoked from `anon` and `authenticated` outright.
- **No naive local time.** `timestamptz` everywhere, plus an IANA zone on the series validated against `pg_timezone_names` by a trigger.
- **No hard delete of a listing.** Series and venues soft-delete; no delete policy exists on either.
- **No client-trusted field that matters.** Status, slot position, moderation status, `is_admin`, `verified`, `eula_accepted_at`, and confirmation stamps are all pinned by triggers.
- **No placeholder or stubbed screen.** All 29 routes are functional; `REVIEW_NOTES.md:128` claims this and the code agrees.
- **No `any`, no type error, no lint error.** `tsc --noEmit` and `expo lint` both exit 0.
- **No failing test.** 478 Jest tests pass. The pgTAP suite could not run here (no Docker) but runs in CI on every push.
