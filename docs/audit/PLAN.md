# PLAN

Recommended course of action, from the read-only audit of commit `564088c`, 2026-08-07.

Nothing in this plan has been executed. No application code has been touched.

---

## 1. Honest assessment

**Yes, this repo is one month from submission, and the gap is smaller than the finding count suggests.** I went looking for the usual reasons a project like this slips and did not find them. There is no missing feature, no half-built screen, no untested subsystem, no naive timestamp, no table without row level security, no `any`, no failing test, and no committed secret. Typecheck, lint, and 478 unit tests all pass clean; 33 pgTAP files with 439 assertions run in CI on every push against a real Postgres with PostGIS. The security model is coherent and, unusually, self-aware: the migration that issues the blanket `grant all` to `anon` is accompanied by a pgTAP test that creates a probe table inside a rolled-back transaction purely to prove how dangerous that grant would be without RLS. That is not a codebase that needs a month of remediation.

What stands between here and the App Store is a different kind of work, and it is almost entirely *wiring and decisions rather than engineering*. Two placeholder URLs (`YOUR-PROJECT-REF`, `TODO_TEAM_ID`), one placeholder mailbox, one EAS profile that may or may not inject environment variables, one admin bootstrap whose only lock is a hosted-project auth setting this repository cannot see, and a handful of business decisions nobody but you can make. The honest risk is not that the code is not ready. It is that eight or nine small items, each individually a fifteen-minute fix, are each blocked on an account, a console, a keystore, or an answer from you, and they serialize badly. If you start the store accounts and the Apple Team ID today, the code work is roughly a week. If you start them in three weeks, the code work is still a week and you will miss the date anyway.

One structural caveat on my own confidence: I could not run the pgTAP suite here (no Docker in this environment), so my reading of every RLS policy and definer function is a reading of the SQL, not an observed result. CI runs it, and I have no reason to doubt it. But if you want a second opinion on the database layer specifically, running `npm run db:up && npx supabase test db` locally is the cheapest way to get it.

---

## 2. The three highest-leverage things to do first

**One: close the admin backdoor (F-001).** Every other finding in this audit is bounded. This one is not. The owner-email bootstrap grants full admin to whoever signs up with one specific address, and the test kit, which is enabled by default in every environment and mints authenticated accounts with a password printed in a migration, sits directly behind that lock. Whether the lock holds depends entirely on a hosted-project auth setting that is not in this repository, and the config file that *is* in this repository turns that setting off. The fix is one migration and two function replacements. The cost of being wrong is the moderation queue, every user's home coordinates, and every user's birth year. Nothing else in this plan has that ratio.

**Two: make the build you submit actually work (F-002, F-006, F-019).** The production EAS profile declares no `environment`, so I cannot tell from the repo whether a production build gets `EXPO_PUBLIC_SUPABASE_URL` at all. If it does not, the app you upload launches to an error screen on every device, and you find out from a reviewer. Meanwhile the TestFlight profile inherits the preview environment, so the build you validate is not the build you ship. And the web deletion page posts to a hostname that does not resolve, which is a Play policy rejection on its own. These are three one-line edits plus a verification step, and together they are the difference between a submission and a wasted review cycle.

**Three: extend the RLS guard to views (F-008).** This is the only item in the top three that fixes nothing broken today, and I am putting it here anyway. This codebase's entire security posture rests on a single load-bearing assumption: `anon` holds `grant all` on everything in `public`, so row level security is not a layer, it is the only layer. The team clearly knows this, and wrote a pgTAP test that names any table missing RLS. But a Postgres view defaults to `security_invoker = off`, which means it runs as `postgres` and bypasses RLS on its base tables entirely, and the guard checks `relkind = 'r'` only. All fourteen existing views are annotated correctly by hand. The fifteenth is a coin flip, and it will be added in a hurry, three days before submission, by someone who is tired. One pgTAP block converts a perfect-so-far discipline into an invariant, and it costs half an hour.

---

## 3. Ordered work plan

Batches are ordered by risk retired per hour of work, not by finding number. Each is independently shippable and independently verifiable. Batch 1 and Batch 2 can run in parallel with each other, because Batch 2 is mostly blocked on external accounts.

### Batch 1: Close the admin backdoor

Closes: **F-001**
Estimated: half a day.

Files: `supabase/migrations/<new>_lock_down_test_kit.sql`, `supabase/tests/test-kit.test.sql`.
Migrations: one new forward migration, one paired down script.

What it does:
1. `alter table test_kit_settings alter column enabled set default false;` and `update test_kit_settings set enabled = false;`
2. `create or replace` both `private.bootstrap_owner_profile` and `private.bootstrap_owner_children` with `and u.email_confirmed_at is not null` added to the owner-email lookup.
3. Two new pgTAP assertions: the kill switch is off after a fresh reset, and an unconfirmed account matching the owner email does **not** get `is_admin`.

Verification you run:
- `npx supabase db reset` then `npx supabase test db`. The new assertions must pass, and the existing 439 must still pass.
- Sign in as the owner on a local build. The test kit screen must render, must say the kit is switched off, and must offer "Switch the test kit on". Tap it, confirm a scenario builds, then tap "Remove all test data".
- Separately, and this is not a code check: open the hosted Supabase dashboard, Authentication, and confirm email confirmation is required. Screenshot it into `docs/store/SUBMISSION_CHECKLIST.md`.

Rollback: `supabase/migrations/down/<name>.down.sql` restores the `true` default and the previous function bodies. The only user-visible effect of rolling back is that the kit is on again by default, so rollback is safe and instant.

Why this batch is small even though the finding is a Blocker: the authorization logic is already correct. Only the defaults and one predicate change.

---

### Batch 2: Wire the launch endpoints

Closes: **F-002, F-004, F-005, F-006, F-019**
Estimated: one day of code, plus whatever the account setup takes.

Files: `web/delete-account/index.html`, `web/.well-known/assetlinks.json`, `web/.well-known/apple-app-site-association`, `src/lib/support.ts`, `eas.json`, `docs/DEPLOY_WEB.md`, `docs/store/SUBMISSION_CHECKLIST.md`.
Migrations: none, unless you change the EULA contact address, which forces a new EULA version (see the decision in section 6).

What it does:
1. Replace `FUNCTION_URL` with the real Edge Function URL. Prefer reading it from a `data-function-url` attribute on `<body>` so the value is set at deploy time rather than committed.
2. Fill in the Apple Team ID in the AASA file and the release SHA-256 fingerprint in `assetlinks.json`.
3. Set `SUPPORT_EMAIL` to the decided address.
4. Add `"environment": "production"` to the `production` EAS profile. Decide and set `environment` explicitly on `testflight` rather than inheriting it.
5. Add a deploy smoke check to `docs/DEPLOY_WEB.md`.

Verification you run:
- `curl -sS -X POST https://<ref>.supabase.co/functions/v1/deletion-request -H 'content-type: application/json' -d '{}'` returns a 400 with `Unknown action`, proving the function is reachable and the URL is right.
- Walk the whole deletion flow on the live page with a throwaway account: request, open the emailed link, confirm, then try to sign in again and fail.
- `curl -sS https://openmicfinder.app/.well-known/apple-app-site-association -i` returns 200, `Content-Type: application/json`, and no redirect. Same for `assetlinks.json`.
- Install a release build on a device, then `adb shell pm get-app-links com.openmicexplorer.app` reports `verified` for the domain. On iOS, paste a `/mic/<id>` link into Notes and tap it; it must open the app.
- `npx eas env:list --environment production` lists both `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Send a mail to the support address from outside your network and confirm it arrives.

Rollback: every item is a config value; reverting the commit restores the previous state. The one asymmetry is the AASA file, which Apple's CDN caches; a wrong value can take up to 24 hours to stop being served, so get it right the first time and test on a device before you announce anything.

Dependencies: this batch is gated on the Apple Developer account (Team ID), the EAS Android keystore (SHA-256), the deployed Edge Function (URL), and your decision on the support mailbox. Start all four now.

---

### Batch 3: Shrink the public surface and make the RLS guard total

Closes: **F-007, F-008, F-014**
Estimated: half a day.

Files: `supabase/migrations/<new>_retire_legacy_discovery_rpcs.sql`, `supabase/migrations/down/<same>.down.sql`, `supabase/tests/grants-and-rls.test.sql`, `supabase/tests/rls.test.sql`.
Migrations: one new forward, one down.

What it does:
1. `revoke execute on function mics_near(...) from anon, authenticated;` and the same for `search_mics(...)`. Keep the definitions for one release, then drop them in a later migration.
2. Add a pgTAP assertion listing any view in `public` whose `reloptions` lack `security_invoker=on` and which is not on an explicit allowlist. Seed the allowlist with the ten views that are deliberately `off`, each with a one-line comment saying why. Adding an `off` view then requires editing the allowlist, which is the point.
3. Add two more assertions: `mics_near` and `search_mics` are not executable by `anon`.
4. Add `set search_path = ''` to `private.set_updated_at`.

Verification you run:
- `npx supabase test db`. The view-guard assertion must pass with the current ten allowlisted views, and must fail if you temporarily add an unannotated view.
- Prove the guard bites: add `create view public.guard_probe as select * from profiles;` inside a scratch migration, run the suite, watch it fail, then delete the scratch migration.
- Open Discover in the app, search, filter, and clear filters. Nothing should change, because the client only calls `search_discover`.

Rollback: the down script re-grants execute on both functions. The pgTAP additions are test-only and cannot break production.

The one thing to check before merging: whether any build already in the field calls `mics_near` or `search_mics`. From this repository, none does. If a TestFlight build from an earlier commit is still installed on someone's phone, revoking will break its Discover tab. Given you have not shipped publicly, I expect this is a non-issue, but it is worth thirty seconds of thought rather than zero.

---

### Batch 4: Correctness in recurrence and credits

Closes: **F-010, F-011, F-015**
Estimated: one to two days.

Files: `src/features/producer/rrule-builder.ts`, `src/features/producer/components/series-form.tsx`, `src/features/producer/rrule-builder.test.ts`, `supabase/migrations/<new>_credit_reports_and_rrule_strictness.sql`, `src/features/safety/labels.ts`, `src/features/credits/components/credit-card.tsx`, `supabase/tests/mic-credits.test.sql`, `supabase/tests/occurrences.test.sql`.
Migrations: one new forward (adds `credit` to the `report_target` enum, which is additive-only and therefore allowed by the schema's own rule; and makes `rrule_matches` raise on unsupported shapes).

What it does:
1. Thread the venue timezone into `computeAnchorDate` so the biweekly anchor is the venue's calendar date, not the device's. Add a test that pins the device to `America/Los_Angeles` and the venue to `America/New_York` on a Sunday evening and asserts the anchor and the first generated occurrence.
2. Make `private.rrule_matches` raise on an RRULE shape it does not implement, instead of silently returning false. Check the seed and the test kit rules first so `db reset` still succeeds.
3. Add `credit` to `report_target` and put a report action on the credit row, so a person credited without consent has a path that reaches the existing moderation queue.

Verification you run:
- `npm test` (the timezone-pinned suite) and the second CI job that reruns it under `America/Los_Angeles`.
- Create a biweekly mic in a different timezone from your device and confirm the first four generated nights land on the weeks you expect.
- `npx supabase test db` for the credit report path and the new rrule exception.
- In the app, credit someone on a mic, then report the credit from another account and confirm it lands in the admin queue.

Rollback: the client change reverts cleanly. The enum addition cannot be rolled back without a type rewrite, which is why the schema rule says additive-only; the down script therefore documents that the enum value stays and only the report UI is removed. That is the "documented reason it cannot have a down script" case.

Scope warning I am giving you now rather than mid-batch: item 3 has a bigger version (notify the linked person, let them unlink, or require acceptance before the link resolves publicly). I am deliberately scoping this batch to the report path only, because that closes the compliance gap at a fraction of the cost. If you want consent-before-publish, that is its own batch and it is post-launch work.

---

### Batch 5: Scheduled-job performance

Closes: **F-009, F-013**
Estimated: two hours.

Files: `supabase/migrations/<new>_retention_indexes.sql`, `supabase/migrations/down/<same>.down.sql`, `supabase/tests/search-indexes.test.sql`.
Migrations: one new forward, one down.

What it does:
1. `create index profiles_home_location_gist on profiles using gist (home_location) where home_location is not null;`
2. `create index favorites_series_idx on favorites (series_id);`
3. Add pgTAP assertions that both indexes exist, matching the pattern `search-indexes.test.sql` already uses.

Verification you run:
- `npx supabase test db`.
- On a database with the seed loaded, `explain analyze select private.queue_new_mic_alerts();` before and after, and paste both plans into the PR. The point is to see the sequential scan on `profiles` become an index scan.

Rollback: drop both indexes. Zero risk; indexes do not change results.

I am **not** including the weekly-digest query rewrite here. Index first, measure, and only restructure the query if the plan is still bad. Rewriting a correct query on a hunch is how correct queries stop being correct.

---

### Batch 6: Make the documents tell the truth

Closes: **F-003, F-012, F-016, F-017, F-018, F-020**
Estimated: half a day.

Files: `docs/store/SUBMISSION_CHECKLIST.md`, `docs/store/STORE_LISTING.md`, `docs/COMPLIANCE.md`, `eslint.config.js`, `app.json`, `docs/audit/FINDINGS.md`.
Migrations: none.

What it does:
1. Reconcile the age-rating guidance onto one answer across all three documents, and record the specific questionnaire responses with the code evidence (UGC yes, infrequent mild profanity via the comedy discipline, unrestricted web access via profile and credit links, no gambling, no purchases, no ads, no tracking) rather than a target tier.
2. Record the Google Maps key restriction as verified, with the date and the SHA-1 fingerprints used.
3. Record the `npm audit` triage: 34 advisories, all in build and lint tooling, none in the bundle, `npm audit fix --force` would break the project. Write it down so nobody re-litigates it in week three.
4. Re-run `npx expo-doctor` on a networked machine and record 20 of 20.
5. Delete the `react-native-purchases` ESLint exception.
6. Drop the unused iOS calendar purpose strings from the `expo-calendar` plugin config.

Verification you run:
- `npm run lint` and `npm run typecheck` still pass.
- **On a real iOS device**, tap "Add to my calendar" on a mic page and confirm the system event sheet still opens. This is the one item in this batch that can actually break something, and it cannot be verified in a simulator or by a test.
- `npx expo-doctor` prints 20 of 20.

Rollback: revert the commit. The only functional change is the calendar plugin config, and the device check above is what protects it.

---

## 4. Batch summary

| Batch | Closes | Effort | Risk retired | Blocked on |
| --- | --- | --- | --- | --- |
| 1. Close the admin backdoor | F-001 | 0.5 day | Very high | Nothing |
| 2. Wire the launch endpoints | F-002, F-004, F-005, F-006, F-019 | 1 day | Very high | Accounts, keystore, your decisions |
| 3. Shrink the public surface | F-007, F-008, F-014 | 0.5 day | Medium now, high later | Nothing |
| 4. Recurrence and credits | F-010, F-011, F-015 | 1 to 2 days | Medium | Nothing |
| 5. Scheduled-job indexes | F-009, F-013 | 2 hours | Low now, medium at scale | Nothing |
| 6. Document truth | F-003, F-012, F-016, F-017, F-018, F-020 | 0.5 day | Low, but it is the rejection surface | Google Cloud console, an iOS device |

Total engineering: roughly four to five working days. The calendar risk is entirely in the external dependencies of Batch 2.

---

## 5. What I recommend explicitly not doing before launch

Cutting scope is part of the job. Each of these is a real improvement that I am telling you to skip.

**Do not run `npm audit fix --force`.** It downgrades `expo-splash-screen` to an SDK 55 version and breaks the project. All 34 advisories are in devDependencies and build tooling. There is nothing to fix. (F-016)

**Do not upgrade Expo, React Native, React, or TypeScript.** Everything is current, coherent, and pinned correctly, including the Reanimated and worklets pairing that ARCHITECTURE.md warns about. A version bump one month from submission buys you nothing and costs you an unknown number of days of native debugging.

**Do not refactor the dual-role model into a real privilege boundary.** Roles are self-service by design and the actual authority checks are per-resource ownership in RLS. It works, it is tested, and it is the right model for a product where anyone can list a mic. Turning `is_producer` into a gated privilege would mean an approval workflow you have not designed, for a problem you do not have.

**Do not build the `producer_profiles.verified` admin grant flow.** No path in the codebase can set `verified` except the owner bootstrap, so today the flag is dead for everyone but you. Note the side effect before you decide: `verified` carries 0.3 of the confidence weight in search ranking (`20260807000300_search_discover.sql:239`, `:298`), so your own listings get a permanent ranking edge over everyone else's. That is worth fixing, but the honest cheap fix before launch is to stop the bootstrap setting `verified = true`, not to design a verification programme. The programme is post-launch work. It is also an open decision, listed below.

**Do not implement RFC 5545 properly.** The supported subset covers weekly, biweekly, and monthly-by-ordinal, which is what real open mics actually do. Making the generator raise on unsupported shapes (Batch 4) gets you safety without the work. `COUNT`, `UNTIL`, `BYMONTHDAY`, and `BYSETPOS` are features nobody has asked for.

**Do not drop `mics_near` and `search_mics`, only revoke them.** Dropping is irreversible and gains you nothing over revoking. Drop them a release later when you are certain no build in the field calls them.

**Do not move off the `openmicfinder.app` domain.** The name mismatch with "Open Mic Explorer" is real and slightly awkward, but that domain hosts the deletion page, the association files, the privacy policy, and the address baked into three published EULA versions. Moving it before launch means new association files, a new deletion endpoint, a new EULA version that re-gates every existing user, and a new set of things to get wrong. Do it after you have shipped, or not at all.

**Do not add a public profile browsing screen.** There is currently no route where one user reads another user's profile page, which is why the Guideline 1.2 report surface is as small as it is. Adding one would add a UGC surface, a new report obligation, a new block-visibility question, and a new moderation load, in the last month before submission.

**Do not rewrite the weekly digest query.** Add the index, measure, then decide. (F-009)

**Do not strip the test kit route from the release bundle.** It is admin-gated server side, the kill switch will be off after Batch 1, and removing a route from one build configuration is exactly the kind of change that produces a "route not found" crash on a link you forgot about. Leave it in and let the server refuse.

---

## 6. Open decisions that need you, not me

You already knew about the first two. There are eleven.

1. **The support inbox address.** `src/lib/support.ts:8` is a placeholder. It appears in Settings, on the rejected-listing note, and inside the published privacy policy. Recommendation: a shared mailbox on the product domain, not a personal address, so it survives you being on holiday during review. (F-005)

2. **The stewardship badge migration.** `supabase/migrations/20260804000100_discovery_stewardship.sql` is committed and will run on the next `db reset`, but `DECISIONS_NEEDED.md:66-79` records that it has not been applied to the hosted database. Decide whether the hosted project is being migrated forward incrementally or rebuilt, because those are different pre-launch procedures and only one of them makes that note meaningful.

3. **Is email confirmation required on the hosted Supabase project?** I cannot see the hosted settings from here, and this is the entire lock on F-001. If the answer is no, the admin backdoor is open right now. If the answer is yes, Batch 1 is still worth doing as defence in depth. Either way I need the answer, and so do you.

4. **Should the owner-email bootstrap exist in production at all?** The alternative is to promote your account once, by hand, through the SQL editor, and delete the trigger. That removes a standing backdoor in exchange for one manual step per environment rebuild. I lean toward removing it from production and keeping it for local and preview, but it is your convenience being traded away, so it is your call.

5. **The legal contact address in the EULA.** `legal@openmicfinder.app` is baked into the published text of EULA 1.0, 1.1, and 1.2 (`20260728000600:93`, `20260729000200:91`, `20260730000100:59`). Changing it requires publishing EULA 1.3, which routes every existing user through the acceptance gate on next launch. That is by design and harmless pre-launch, and expensive after. Decide the address now, while it is free.

6. **The publisher entity name.** You told me the publisher is Stoned Goose Productions LLC. That string appears nowhere in this repository: not in the EULA, not in the privacy policy, not in `app.json`, not in the store docs. The EULA says "we" and "us" without ever naming a party, which is legally thin for an agreement you are asking users to accept. Decide where the entity name goes and I will put it there, but I will not invent placement or wording for a legal document.

7. **The age rating answer.** Three documents disagree: two say Apple 16+, one says 17+, a tier that no longer exists. Separately, decide whether you are comfortable with an 18+ in-app gate and a 16+ store rating, because a reviewer who reads your EULA will see 18 and may ask why. (F-012)

8. **Should TestFlight talk to the preview backend or the production one?** Right now it inherits preview. Testing against preview keeps production data clean; testing against production means the last build you validate is the one you ship. Both are defensible. Pick one and write it down. (F-019)

9. **`producer_profiles.verified`: keep the ranking weight or neutralize it?** Nothing can set the flag except the owner bootstrap, so today it is a permanent 0.3-point search-ranking advantage for your own listings and dead for everyone else. Options: stop the bootstrap setting it (cheap, fair, five minutes), drop the weight from the ranking model until a verification programme exists (cheap, slightly worse ranking), or build the programme (not before launch). I would take the first.

10. **Who answers the 24-hour moderation promise?** Three EULA versions and the on-screen copy in the admin queue commit you to reviewing reported content within 24 hours. That is a staffing commitment, not a code one, and Apple will hold you to the text you wrote. Decide who is on call and what happens when they are not.

11. **Who owns the Google Cloud billing account behind the Maps key, and who verifies the restriction?** F-003 is not fixable in this repository. Somebody needs console access, the release SHA-1 from the EAS keystore, and the willingness to check it again after the keystore is regenerated.

---

## 7. Execution protocol I will follow, once you approve

Restating so we agree before anything is written.

- One batch at a time, one branch per batch, conventional commits, small and reviewable.
- After every batch: `npm run typecheck`, `npm run lint`, `npm test`, and where the batch touches SQL, `npx supabase test db`. Plus the written manual verification step listed for that batch, for you to run.
- Migrations forward only. Never rewrite an applied migration. Every migration gets a paired down script in `supabase/migrations/down/`, or a written reason it cannot have one (the `report_target` enum addition in Batch 4 is the one such case).
- Any change touching RLS ships with a test that proves the policy **denies** the case it is meant to deny, not only that it allows the happy path.
- If a batch turns out larger than estimated, I stop and tell you before continuing. I will not silently expand scope. Batch 4 is the one I would flag first, because the credit-consent question has a much larger version hiding inside it.
- If I disagree with this plan once I am inside the code, I say so and propose the alternative before writing it.

**Stopping here and waiting for your approval. No execution has begun.**
