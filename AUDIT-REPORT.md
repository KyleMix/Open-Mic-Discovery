# Open Mic Explorer: pre-launch audit

Date: 2026-08-11. Scope: the whole codebase (React Native / Expo SDK 57 client, Supabase backend, web deletion and deep-link pages). The app is Open Mic Explorer, id `com.openmicexplorer.app`, version 1.0.0.

Method: every user-facing flow was traced through the code, the migration set was applied to a local Postgres 16 + PostGIS and the full pgTAP suite run, and the client checks (`typecheck`, `lint`, 554 Jest tests) were run green before and after the fixes in this pass. Reported defects were verified against the code or by direct database probe, not taken from prose. Where a plausible finding turned out to be wrong, that is stated so it is not chased again.

Headline: the codebase is in strong shape. It is not the code that blocks submission, it is a set of owner-only account and deployment steps (store enrollment, real deploy URLs and signing fingerprints, a working support mailbox) and a cluster of stale documents that would misdeclare the app if used to fill the store forms. The one thing that is both code-shaped and important is that the app's own primary growth path, shared links, is dead in the field until the deep-link association files carry real values.

---

## 1. Launch blockers

These will cause a rejection, a broken store requirement, or a silently broken primary feature. None is a crash in the shipping app.

### B1. Deep-link association files still carry placeholders, so shared links never open the app
`web/.well-known/apple-app-site-association:6` is `TODO_TEAM_ID.com.openmicexplorer.app`; `web/.well-known/assetlinks.json:7` is `TODO_SHA256_CERT_FINGERPRINT`. Meanwhile `app.json` advertises the domain on both platforms (`applinks:www.stonedgooseproductions.com` and an `autoVerify` intent filter for `/open-mics/mic/`). Until these hold real values, every shared `https://.../open-mics/mic/<id>` link opens the web fallback instead of the app, on iOS and Android both. Sharing is the app's wedge (a whole `src/features/share/` flyer feature feeds it), so this is a launch blocker even though nothing crashes. `src/lib/linking.test.ts` only `console.warn`s about the placeholders, so the suite stays green while the feature is broken. Needs the Apple Team ID and the Play app-signing SHA-256, both of which only exist after store enrollment. Tracked in `docs/LAUNCH-CHECKLIST.md`.

### B2. Web account-deletion page posts to a placeholder URL (Google Play requirement)
`web/delete-account/index.html:105` is `data-function-url="https://YOUR-PROJECT-REF.supabase.co/..."`. Play requires a working web-accessible deletion URL and a human checks it. The page fails safe (it disables the buttons and shows a "not finished being set up" message rather than a broken form, `:208-238`), which is the right failure mode, but a reviewer hitting a dead page is still a rejection. Fix is one attribute set at deploy time; the Edge Function behind it (`supabase/functions/deletion-request/index.ts`) is complete and correct. Needs the production Supabase project ref.

### B3. iOS submit cannot run: `ascAppId` is a placeholder
`eas.json:36` is `ascAppId: "PASTE-NUMERIC-APP-ID-FROM-APP-STORE-CONNECT"`, and `npm run submit:ios` wires straight to it. `eas submit --profile production --platform ios` fails until the numeric App Store Connect app id is pasted in. Needs the App Store Connect app record (step 5 of the launch checklist).

### B4. Support contact is a mailbox that does not exist yet
`src/lib/support.ts:9` is `kyle@stonedgooseproductions.com`, surfaced in Settings, the rejected-listing note, and inside the published privacy policy. Apple Guideline 1.2 requires a working contact for UGC apps and reviewers test it; a `mailto:` to an address with no inbox is a rejection. The address is the right shape (shared mailbox on the product domain). It just needs to be created and to receive mail before submission.

### B5. Live admin credentials are committed to git
`REVIEW_NOTES.md:19` gives `kylewmixon@gmail.com` / `openmicexplorer-tester-2026`. Per that file's own note (`:73-75`) this account is bootstrapped by the database, not the seed, so on any environment it lands as an approved admin with both roles. This is a real admin credential in a public-history repo. Rotate the password before or immediately after the repo is exposed, and treat the bootstrap allowlist as owner-only. (The other four reviewer rows are `@demo.openmicexplorer.local` and harmless.) See also the F-001 owner-bootstrap discussion in `docs/audit/FINDINGS.md`, which the app already partly hardened.

Not a blocker, deliberately: the Google Maps Android key committed at `app.json:118` is public by construction (it ships in every APK) and is correctly handled as a "restrict it, do not hide it" item in the launch checklist. It is billing-abuse surface, not a data leak. Confirm the Cloud Console application restriction before launch; the checklist has a blank "date verified" line for it.

---

## 2. Fixed in this pass

All fixes kept `typecheck`, `lint`, 554 Jest tests, and the pgTAP suite green. Nothing in the "do not change without asking" set (schema, RLS, auth flow, navigation structure, moderation pipeline) was touched.

### Correctness: three producer consoles rendered on a failed load instead of gating
`src/app/producer/analytics/[id].tsx`, `src/app/producer/credits/[id].tsx`, and `src/app/producer/night/[occurrenceId].tsx` each gated ownership with `detail.data?.series && !canManageSeries(...)`. When the detail/context query errored or returned null, the gate was skipped and the screen rendered. Because RLS filters other people's rows to empty rather than erroring, a stranger following a deep link saw a well-formed page: "0 signups" analytics about someone else's mic, a live lineup editor with Change/Remove buttons, or a night roster reading "Nobody on the list yet" about a real night. Each now shows an error-with-retry when the gating query fails, matching the pattern the live screen (`producer/live/[occurrenceId].tsx`) already had.

### Test: `user-sanctions.test.sql` failed depending on the wall clock
Assertion 20 inserted a control signup for the seeded performer on "the soonest night with an open window." When the clock made that night the same one the seed already signs that performer up for, the insert hit the unique key and the file died mid-plan. Scoped the target-night selection to nights neither fixture performer is already on (the same shape as the F-021 fix in `docs/audit/FINDINGS.md`). The suite is now 790/790 regardless of time of day.

### Performance: EULA body markdown no longer loads on every cold start
The acceptance gate in `src/app/_layout.tsx` called `useLatestEula()`, which selected `version, body_md` (a few-KB markdown blob) and ran on every launch including for signed-out guests, blocking the boot path for signed-in users. Split into `useLatestEulaVersion()` (version only, used by the gate) and `useLatestEula()` (with body, used only by the terms screen). `src/features/auth/queries.ts`, `src/app/_layout.tsx`.

### Performance: role update ran two independent writes serially
`useUpdateRoles` (`src/features/profile/queries.ts`) did the `performer_profiles` upsert and the `producer_profiles` upsert as two sequential round trips. They touch different tables and do not depend on each other, so they now run in a single `Promise.all`. Halves the write latency for a dual-role save.

### Performance: indexes for the two seq-scanning people searches and the moderation queue
Migration `20260811000400_search_and_queue_indexes.sql` adds trigram GIN indexes on `profiles.handle` and `profiles.stage_name` (the Network people search and credits person-picker run leading-wildcard `ilike` through `public_profiles`; `handle` is a citext unique btree a wildcard cannot use and `stage_name` had no index, so both screens seq-scanned profiles), plus partial indexes matching the five moderation-queue reads (`profiles`, `venues`, `mic_series`, `mic_credits` pending, and `listing_flags` open). Additive only: an index cannot change results, only cost. Down migration and three pgTAP assertions in `search-indexes.test.sql` (both trigram indexes are GIN + `gin_trgm_ops`, and all five queue indexes are partial); verified to fail on the reverted schema. This was proposed item 3a, now applied at your request. Uses plain `CREATE INDEX` (the chain applies to a fresh, empty project); on an already-populated database, build them `CONCURRENTLY` out of band instead.

### Security (defense in depth): took back grants nothing legitimate uses
The schema's model is "RLS is the only layer": a blanket `grant all ... to anon, authenticated` sits behind default-deny policies. Migration `20260811000300_defense_in_depth_revokes.sql` narrows that where an API role held a write no policy could ever use, so a single missing or wrong policy is not the only thing standing between a caller and a write. Revoked `EXECUTE` on `private.delete_account_for(uuid)` from public/anon/authenticated (it checks no caller identity of its own and was one PostgREST-config line from an "any user deletes any account by uuid" primitive; the SECURITY DEFINER wrappers still reach it, verified by `deletion.test.sql`). Revoked writes from `anon` on `connections`, `mic_credits`, `attendance_plans` (all write policies there are authenticated-only), and from both API roles on `series_search` (no write policy exists; writes are DEFINER-only sync functions). `share_events` was deliberately left alone because `anon` holds a real INSERT policy for guest shares. Matches the existing revokes on `report_triage` and `user_sanctions`. Down migration and eight pgTAP assertions in `grants-and-rls.test.sql` (plus the `series_search` write-denial message in `search-surface.test.sql` now reads "permission denied" ahead of RLS); verified to fail on the reverted schema. This was proposed items 3b findings 6 and 7, now applied at your request.

### Security: a user can no longer soft-delete (and thereby lock) their own profile
`profiles owner update` had `deleted_at is null` in its USING but not its WITH CHECK, so a client could send `update profiles set deleted_at = now()`; the write succeeded and then USING refused every later self-update, freezing the row into a signed-in-but-unusable state account deletion never produces. Migration `20260811000200_profiles_cannot_self_delete.sql` adds `deleted_at is null` to the WITH CHECK. This is the right layer, not the guard trigger: the only legitimate writer of `deleted_at` is `private.delete_account_for`, which is SECURITY DEFINER owned by a superuser and bypasses RLS, so deletion is unaffected (verified: `deletion.test.sql` still passes). Scoped to `deleted_at` only; `is_producer`/`is_performer` are deliberately left self-settable because onboarding and the in-app role toggle write them by design. Down migration and a pgTAP assertion in `rls.test.sql`, verified to fail on the reverted schema. This was proposed item 3b and is now applied at your request.

### Security: banned and unapproved host names no longer leak through search
`series_search` is world-readable by design (presence is the access control so the GIN indexes stay usable), but `build_series_search` indexed the host stage name filtering only on `deleted_at`, and neither a rejection (`profiles.moderation_status`) nor a ban (a `user_sanctions` row plus an `is_active` pause) rebuilt the affected rows. So `select fuzzy from series_search` as anon returned the stage names of pending, rejected, and banned hosts. Migration `20260811000100_search_hides_hidden_hosts.sql` gates the host contribution on approved-and-not-banned (in the LEFT JOIN, so the series stays searchable on its own title and venue), widens the profiles sync trigger to fire on `moderation_status`, and adds a `user_sanctions` trigger so a ban or lift rebuilds the host's series, with a backfill to scrub anything already exposed. Down migration and four pgTAP assertions alongside (banned name vanishes, series still searchable, lift restores it, rejected name hidden); verified they fail on the reverted schema. This was proposed item 3b and is now applied at your request.

### Instrumentation: dev-only timing around the five suspected-slowest queries
Added `src/lib/query-timing.ts`, a `timed(label, run)` wrapper that logs `[supabase 132ms] <label>` in `__DEV__` and is a zero-cost passthrough in release builds. Wired into the discovery feed (`discover:feed`), mic detail (`mic:detail`), favorites next-nights (`favorites:nextNights`), producer next-nights (`producer:nextNights`), and the roster (`signups:roster`) so before/after can be measured on device. No production behavior change.

---

## 3. Proposed changes awaiting your approval

Held back because they touch schema, RLS, auth flow, or navigation. Exact SQL and diffs are in `docs/audit/proposed/`.

### 3a. Missing indexes (APPLIED as migration `20260811000400`, see section 2)
Additive `CREATE INDEX` only; cannot change results, only cost.

- High value: trigram GIN on `profiles.handle` and `profiles.stage_name`. People search and the credits person-picker run `handle ilike '%x%'` / `stage_name ilike '%x%'` through `public_profiles`; `handle` is a citext unique btree a leading wildcard cannot use and `stage_name` has no index, so each keystroke past two characters sequentially scans `profiles` on two screens. The earlier trigram migration covered `mic_series` and `venues` and stopped there.
- Moderation-queue scale: partial indexes on `moderation_status = 'pending'` for `profiles`, `venues`, `mic_series`, `mic_credits`, and on `listing_flags(status='open')`. The queue reads scan these tables today; low urgency at launch volume. Confirmed present and NOT needed: `reports_queue_idx (status, created_at)` and the `claim_requests` partial index already cover their queue reads.

### 3b. RLS and grant hardening (SQL: `docs/audit/proposed/rls-remediation.sql`)
- Real, low severity: `profiles owner update` lets a user self-set `deleted_at`. APPLIED this pass, see section 2 (migration `20260811000200`). The roles half of the original note was withdrawn on inspection: `is_producer`/`is_performer` are self-set by design (onboarding and the in-app role toggle write them directly), so pinning them would break onboarding; they are not a `review_claim` bypass. Fixed at the RLS WITH CHECK layer, not the guard trigger, because `delete_account_for` runs with the deleted user's `auth.uid` and would be caught by a trigger.
- Real, medium: banned and unapproved host stage names readable by anon through `series_search`. APPLIED this pass, see section 2 (migration `20260811000100`). Was: `build_series_search` filtered the host join only on `deleted_at is null` and `profiles_search_sync` never fired on `moderation_status`.
- Defense in depth: `revoke execute` on `private.delete_account_for(uuid)`, and revoke the blanket default write grants where no policy uses them. APPLIED this pass, see section 2 (migration `20260811000300`). Scope was corrected during implementation: `share_events` was excluded (anon holds a real guest-share INSERT policy) and the write revokes are anon-only except `series_search` (which has no write policy for either role).

Explicitly NOT a finding: the "cross-tenant write via missing WITH CHECK" concern on `occurrences owner update`, `credits manager update`, and `venues creator update` is not exploitable. Postgres applies the USING expression as the implicit WITH CHECK on UPDATE, so the new row's `series_id`/`created_by` is validated against ownership. Probed directly: the move is rejected with "new row violates row-level security policy." No change proposed.

### 3c. Auth-flow bug: "already registered" sign-up is a dead end (diff below)
`signUpWithEmail` (`src/features/auth/api.ts:56-69`) returns `needsEmailConfirmation: data.session === null`. With Supabase's email-enumeration protection on, signing up with an email that already exists returns success with a null session, so the screen tells the user to check their inbox for a confirmation link that never comes. Held back because it is an auth-flow change. Proposed:

```
   const { data, error } = await getSupabase().auth.signUp({ email, password, options: {...} });
   if (error) { throw authError(error, '...'); }
-  return { needsEmailConfirmation: data.session === null };
+  // Supabase's enumeration protection returns success with no session and an
+  // empty identities array when the email is already registered. Treat that
+  // as "account exists" so the screen sends them to sign in, not to an inbox
+  // that will never get a confirmation link.
+  if (data.user && (data.user.identities?.length ?? 0) === 0) {
+    return { alreadyRegistered: true, needsEmailConfirmation: false };
+  }
+  return { alreadyRegistered: false, needsEmailConfirmation: data.session === null };
```
The sign-up screen then routes `alreadyRegistered` to "This email already has an account. Sign in?" Needs the confirm-enumeration-protection state of the hosted project to test against.

### 3d. Other auth-flow items to decide (details in section 6 of this report)
The reset-link-applied-to-wrong-account bug, the auth-callback remount re-exchanging a one-time code, the silent onboarding-data-loss path, and the offline sign-out trap on the EULA/onboarding screens are all real and all in auth-flow code. They are written up in the UX section with file references; each is a small fix but each changes auth behavior, so they wait for your go-ahead.

---

## 4. UX recommendations, ranked by user impact

1. Share sheet swallows all of its own feedback on iOS. `ShareSheet` is a React Native `Modal`; the toast renders as a sibling of the root tree, so on iOS it draws under the modal. Every message the sheet shows, the generic failure, "Caption copied", "Saved to your photos", and the save-permission prompt, is invisible. A failed image generation looks like a button that did nothing. Move the toast host inside the modal, or present feedback inline in the sheet. `src/features/share/components/share-sheet.tsx`, `src/components/toast.tsx`.
2. Auth-callback shows "that link expired" to a user who just signed in. On a successful email-confirmation exchange the session flips, `AuthGate` unmounts the whole `<Stack>`, the pending `router.replace` is cancelled, and on remount the effect re-runs on the same one-time code and fails. Hits the reinstall / second-device case. Guard the effect on an already-exchanged ref, or add `auth-callback` to the gate's exempt routes. `src/app/auth-callback.tsx:29-55`.
3. Password reset can change the wrong account's password. `reset-password.tsx:31-34` skips the code exchange when a session already exists, so opening account B's reset link while signed in as A updates A's password. Exchange whenever a `code` is present. `src/app/(auth)/reset-password.tsx`.
4. Silent onboarding data loss. If the profile query is in an error state with cached data absent, an existing user is treated as new and sent through onboarding; `completeOnboarding` finds the existing row and skips the insert, discarding the stage name, home area, and birth year the user just typed, then loops back to the EULA. `src/features/auth/api.ts:218-229`, `src/app/(auth)/eula.tsx:54`.
5. Offline sign-out traps users on the EULA and onboarding screens. Supabase `signOut` returns an error (and does not clear the local session) when the network call fails; on the two forced-gate screens whose only exit is "Not now: sign out," that leaves no way out offline. Fall back to a local-scope sign-out. `src/features/auth/api.ts:124-132`.
6. A malformed mic id in a deep link shows a retry that can never work. `mic/[id].tsx:112-117` surfaces the Postgres cast error as "Check your connection. Try again," an infinite retry. Detect the not-found/invalid case and show a dead-end-free "not found," the way `producer/[id].tsx` already does.
7. Boot spinner with no timeout when queries are paused offline. `AuthGate` gates the whole tree on `profile.isPending || eula.isPending`; offline those queries pause rather than error, so a cold start with a cold cache can sit on "Getting things ready" indefinitely, past the `isError` escape hatch. Add a timeout that falls through to the recovery screen. `src/app/_layout.tsx:70,167-187`.
8. Offline and sanction banners draw under the status bar on notched devices (no top safe-area inset). `src/app/_layout.tsx:236-237`.
9. Terminology: the live screen calls one occurrence both "the night" and "the show" (`producer/live/[occurrenceId].tsx`, e.g. "Finish the night" vs "End show"). Everywhere else the instance is consistently a "night." Normalize to "night" (leave the `no_show` enum alone). Elsewhere terminology is disciplined: mic / night / listing are used consistently, "series" never leaks to UI copy, and "event" appears in user copy exactly once and correctly.
10. Producer tab drops "tonight" silently on error. `useNextNights` has no error surface, so a failure just hides the "Open tonight's list" button rather than saying anything. `src/app/(tabs)/producer.tsx:33`.

Accessibility is genuinely strong and needs no launch work: 70 `accessibilityLabel`, 59 `accessibilityRole`, a 44pt min-touch-target token with a floor test, reduced-motion honored app-wide, and no unlabeled icon-only buttons. The em-dash ban is the best-enforced rule in the repo (three guard tests, zero violations across `src/`, `web/`, `marketing/`, `docs/`).

---

## 5. Supabase performance findings

The single biggest lever is not in the code. `docs/LAUNCH-CHECKLIST.md` and `docs/FIRST-FIVE-WALKTHROUGH.md` instruct creating the production project as Pro tier in us-west (Oregon), but nothing in the repo can confirm the project that the production APK actually points at. If it is on the free tier, the idle-pause resume looks exactly like "Supabase is slow" on first open of the day; if it is not in us-west, every round trip in every waterfall below is inflated by cross-region latency. Confirm region and tier in the dashboard first.

Client init is clean: one lazily-created singleton, correct RN auth settings (`autoRefreshToken`, `persistSession`, `detectSessionInUrl: false`, pkce), AppState wired to start/stop the refresh timer. Images are all in Storage with CDN URLs, never in table rows. The `20260801000500` RLS InitPlan work is correct and, impressively, guarded against regression by a pgTAP suite that has caught at least one later bare-`auth.uid()` slip.

Findings, with expected impact:

- Startup network on the boot-block path. `useLatestEula` pulled `body_md` on every cold start (fixed this pass, section 2). `useOwnProfile` still does `select('*')` including the PostGIS `home_location` (WKB hex), `birth_year`, and `bio` on the same path; narrowing it needs enumerating all 18 consumers (edit-profile reads the full row), so it is a recommendation, not a blind fix. Impact: shaves the cold-start blocking fetch.
- Unbounded list queries. Many list reads have no `.limit()`: favorites, going, network, roster, moderation queue, `useMySeries`, `useNextNights`. The worst is `useFavorites`' occurrence fetch (`favorites/queries.ts:63`), which pulls every future occurrence for every favorited series (30 favorites x ~13 weekly nights = hundreds of rows) to compute one next-night per series. A `.lte('starts_at', now + 60d)` bound plus the eventual distinct-on RPC is the fix; a blind `.limit()` there would be wrong because it needs the first night of every series. Impact: large on heavy-favorites users on cellular.
- `useNextNights` over-fetch and waterfall. It fetches every future scheduled occurrence across every series the producer owns with a per-row `signups(count)`, then keeps only the first per series in JS; and it runs only after `useMySeries` resolves (two serial round trips before the producer tab paints). The right fix is a `distinct on (series_id)` RPC. Impact: medium, on the producer home screen.
- N+1 on the mic detail page. After the `Promise.all`, a third serial round trip to `producer_public` fetches one `verified` boolean for claimed mics. Embed it as `owner:producer_public(verified)` on the series select. Impact: one RTT per claimed-mic open.
- `select('*')` over-fetch across ~15 query sites (listed by the performance pass): mic detail's `venues(*)`, plans views, `my_connections` (pulls bio + six link columns just to render the tab-bar badge count), credits, safety. Narrowing to the columns each screen draws is safe per-site work; none is a blind fix because each needs checking against its consumers.
- Refetch chattiness. `refetchOnMount`/`refetchOnWindowFocus`/`refetchOnReconnect` are all default-true with a 60s `staleTime`, so returning to any tab after a minute or foregrounding the app re-issues every mounted query as a background refetch. Reference-shaped queries (mic detail, credits, blocked users, EULA) could carry a 5-15 min `staleTime`. These are background refetches (no spinner), so the symptom is "chatty on cellular," not "blank." Recommendation, not applied, to keep freshness behavior a deliberate choice.
- Realtime invalidation is broader than needed. `useMySignup`'s filter is user-scoped, so any signup change invalidates the cached signup state for every night the user has loaded; it is also mounted twice on the mic page (card + sticky footer), doubling the stream and the cascade; and every realtime handler does a full `invalidateQueries` rather than reading `payload.new`. Worse neighbors: `safety/queries.ts:46,63` call `invalidateQueries()` with no key (a block refetches the entire app), and a producer write invalidates the whole `['mics']` discovery namespace. Narrow the keys. Impact: medium on busy rosters and after any block.
- RLS read-path cost at scale. `signups producer select` and `plans producer select` call `owns_occurrence_series(occurrence_id)`, a SECURITY DEFINER function doing an occurrence-to-series join per row; on the unbounded roster read that fires once per signup. `occurrence_spots` runs three correlated subqueries per row and is polled every 20s by `useNightSpots`. `connection_nights` unions all of `attendance_plans` + `signups` before joining to the accepted-pairs CTE, which will not scale. These are correctness-correct but worth watching; none is a launch blocker at seed volume.

Indexes to add are in section 3a. Dev-only timing is wired (section 2) so these can be measured on a real device before and after.

---

## 6. Go / no-go checklist for submission

Code readiness: GO. Strict TypeScript with no `any`, zero lint errors, 554 Jest tests green, 790 pgTAP assertions green, RLS on all 32 tables, the full Guideline 1.2 set present and server-enforced (EULA gate with version+timestamp, report on every surface, server-side blocks, moderation queue with a 24-hour target, automated text filter), in-app and web account deletion that actually deletes, a global error boundary, privacy manifest, and no committed secrets beyond the by-design public Maps key. The moderation "console" is the in-app `/admin` screen plus `docs/admin/RUNBOOK.md`, not a Next.js app (there is no Next.js in the repo); this is a deliberate, documented decision (D4) and satisfies the takedown requirement.

Blocking on owner action before submit:

- [ ] B1: fill real Team ID and Play signing SHA-256 into both `web/.well-known/` files and deploy them at the domain root; verify with Apple's AASA validator and `adb shell pm get-app-links`.
- [ ] B2: set `data-function-url` on the deployed deletion page to the real Edge Function URL; curl it to confirm a 400 on empty body.
- [ ] B3: paste the numeric App Store Connect app id into `eas.json` `submit.production.ios.ascAppId`.
- [ ] B4: create the `kyle@stonedgooseproductions.com` mailbox and confirm it receives external mail.
- [ ] B5: rotate the admin password published in `REVIEW_NOTES.md`; keep the bootstrap allowlist owner-only; confirm hosted-project email confirmation is on.
- [ ] Confirm the production Supabase project is Pro tier, us-west, migrations pushed, reviewer seed loaded (per launch checklist step 3).
- [ ] Restrict the Google Maps Android key (Cloud Console application + API restriction) and record the verification date in the submission checklist.
- [ ] Run `npm run check:backend` against the production URL/key and `npx expo-doctor` (target 20/20) from an unrestricted network.
- [ ] Reconcile the stale docs before filling store forms (below), especially the phantom-monetization declarations.

Documentation to fix before the store forms are filled (these would misdeclare the app):

- [ ] `docs/privacy/SDK_MANIFEST_AUDIT.md:37` declares `react-native-purchases` collecting "Purchase history." The app has zero purchase code and sells nothing. Copying this into App Store Connect declares data collection that does not exist. Also update the doc's drifted versions (RN 0.86.2, reanimated 4.5.1, worklets 0.10.1) and add the native-bearing deps it omits (`expo-media-library` especially, since it is permission-gated photo access).
- [ ] `docs/store/SUBMISSION_CHECKLIST.md` is pre-rebrand throughout ("Open Mic Finder," `com.openmicfinder.app`, `openmic://` scheme, "358 pgTAP tests," RevenueCat keys). It self-declares superseded by `LAUNCH-CHECKLIST.md`, but `REVIEW_NOTES.md:7` still points readers at the wrong file. Either delete it or stamp it clearly stale.
- [ ] `docs/store/ACCOUNT_DELETION_PAGE.md` is a stale competing deletion story ("Open Mic Finder," "within 7 days" email flow) that contradicts the shipped self-service immediate deletion; `docs/store/DATA_SAFETY_ANSWERS.md` has it right. Align on the shipped page.
- [ ] `docs/APP_BREAKDOWN.md` and `docs/pitch/INVESTOR_PITCH.md` describe a RevenueCat paywall as shipped; it was removed. Investor- and store-facing, and false.

Recommended before submit but not blocking: the section 4 UX items (share-sheet feedback and the four auth-flow bugs first), and the section 3 RLS hardening (the banned-host name leak is the one worth doing pre-launch).

Areas checked and genuinely clean, stated so the absence is evidence: no table without RLS; no public read policy leaking unapproved or soft-deleted content; producer PII exposed in no view; no naive local time; no hard delete of a listing; no `console.*` in shipping paths; no TODO/FIXME/HACK in application code; no em dashes anywhere user-facing; no dead code (the two `.web.tsx` files are platform-resolution, not orphans); realtime subscriptions scoped and torn down on unmount; the Supabase client a correct singleton; images in Storage not rows.
