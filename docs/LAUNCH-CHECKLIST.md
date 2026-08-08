# Launch checklist: everything only you can do

Ordered handoff for getting Open Mic Explorer into TestFlight and Google
Play Internal Testing. Written 2026-08-08 by the store readiness pass so
you can work top to bottom without opening the code. Everything code-side
is done and verified; every step here needs your identity, your card, or
your decision. `docs/store/SUBMISSION_CHECKLIST.md` is the older, longer
runbook; where they disagree (it predates the Explorer rebrand and still
says "openmicfinder" bundle ids in places), THIS file is current.

## Decisions blocking or shaping steps below, up front

- **D1, support inbox (blocks step 8).** The app's one support address is
  the constant `SUPPORT_EMAIL` in `src/lib/support.ts`, set to
  `support@stonedgoose.com` per the domain decision. The inbox does not
  exist yet: create it (step 8) or, if you prefer a different address,
  change that one constant and use the same address in both store
  consoles.
- **D2, stewardship badge migration (shapes step 5).** Migration
  `supabase/migrations/20260804000100_discovery_stewardship.sql` is
  written, tested, and NOT yet applied anywhere hosted. It drops and
  recreates `mics_near` and `search_mics` with one appended column. Before
  applying to production confirm: (a) you are applying the full migration
  chain to a fresh project anyway, in which case it simply runs in order
  and there is nothing special to do, and (b) after any apply you
  regenerate types (`npm run db:types`) and commit them. The app behaves
  identically with or without it (badge appears only when the column
  exists).
- **D3, product domain: DECIDED 2026-08-08.** The web presence lives
  under the publisher domain, subpath `stonedgoose.com/openmic`. The
  sweep is done: universal links associate with host `stonedgoose.com`
  (association files MUST be served from `stonedgoose.com/.well-known/`,
  the domain root, not the subpath), app pages live under `/openmic/`
  (mic links, delete-account, privacy, terms), the app strips the prefix
  via `src/app/+native-intent.tsx`, EULA 1.3 records the new addresses,
  and support/legal addresses are `support@stonedgoose.com` and
  `legal@stonedgoose.com`. Your remaining part is hosting (step 7) and
  creating the inboxes (step 8); do not submit until the pages are live,
  because Apple follows the links.
- **D4, moderation console: DECIDED 2026-08-08.** Submit without the web
  console. The in-app `/admin` screen plus `docs/admin/RUNBOOK.md` are
  the takedown path (works, audited as of this pass) and satisfy Apple's
  24-hour requirement. The console gets built after launch on the
  already-shipped database layer.

## 1. Apple Developer Program, as an organization

- Do: enroll Stoned Goose Productions LLC at
  https://developer.apple.com/programs/enroll/. Choose Organization, not
  Individual. You will need: a D-U-N-S number for the LLC, your legal
  entity name exactly as registered in Washington, a phone number Apple
  can call, and authority to sign for the company.
- D-U-N-S first if you lack one: free at
  https://developer.apple.com/enroll/duns-lookup/. Issue or correction
  takes up to 5 business days.
- Cost: 99 USD per year. Time: D-U-N-S up to 5 days, Apple verification
  typically 1 to 3 days after that, sometimes a verification phone call.
- Unblocks: bundle id registration, App Store Connect, TestFlight.
- Start this TODAY; it is the longest pole.

## 2. Google Play Console, as an organization

- Do: create the developer account at https://play.google.com/console/signup
  choosing Organization. You will need: a Google account for the business,
  the LLC details, a payment card, and identity documents for
  verification; Play may also ask for the D-U-N-S number.
- Cost: 25 USD once. Time: identity verification typically 1 to 3 days.
- Why organization matters: personal accounts created after Nov 2023 must
  run a 12-tester, 14-day closed test before production access.
  Organization accounts skip that gate. Nothing in the repo assumes
  otherwise; you asked to confirm and it is confirmed.
- Unblocks: app creation, internal testing track, Data safety form.

## 3. Supabase production project

- Do: at https://supabase.com/dashboard create a new project (paid tier;
  the free tier pauses idle projects, which takes the app down). Region:
  us-west (closest to your users).
- Apply the schema: with the Supabase CLI logged in,
  `npx supabase link --project-ref <ref>` then `npx supabase db push`
  (runs all 72 migrations in order, including the stewardship one, D2, and
  this pass's audit migration).
- Then, in the dashboard:
  - Storage: create public buckets `avatars` and `posters` if `db push`
    did not (policies ship in the migrations).
  - Auth, URL configuration: add redirect URLs
    `openmicexplorer://auth-callback` and
    `openmicexplorer://reset-password`.
  - Auth, providers: enable Apple and Google. Client ids and secrets come
    from steps 1 and 2 consoles (Apple: Services ID + key from
    developer.apple.com; Google: OAuth client at
    console.cloud.google.com). Local names for these are in
    `.env.example`.
  - Auth, SMTP: configure custom SMTP (any transactional provider;
    Resend, Postmark, or SES all work) so reset and confirmation emails
    come from your domain and survive volume. Without it, auth emails are
    rate limited to a trickle.
  - Vault: create `push_sender_url` and `push_sender_token` per the
    header of migration 20260803000700, so the push cron can invoke the
    Edge Function.
  - Edge Functions: `npx supabase functions deploy deletion-request` and
    `npx supabase functions deploy push-sender`.
- Seed reviewer data: run `supabase/seed.sql` against the project (SQL
  editor or `psql`), then change the demo account passwords and record
  them in `REVIEW_NOTES.md`.
- What to paste back: project URL and anon key into EAS env vars (step 6
  commands), nothing into the repo.
- Cost: from 25 USD per month. Time: an afternoon.
- Unblocks: every build that talks to production.

## 4. Google Maps Android key: restrict it

- Do: at https://console.cloud.google.com/apis/credentials find the key
  that is in `app.json` (it ships in every Android binary and sits in git
  history, so treat it as public). Restrict it: Application restriction =
  Android apps, add package `com.openmicexplorer.app` with your upload
  key SHA-1 AND the Play App Signing SHA-1 (visible in Play Console after
  step 5, App integrity page). API restriction = Maps SDK for Android
  only. If the key was ever unrestricted, prefer rotating: create a new
  restricted key, put it in `app.json`, commit.
- Cost: free at this usage. Time: 15 minutes (plus a rebuild if rotated).
- Unblocks: Android maps that keep working and a bill that stays zero.

## 5. Store records

- App Store Connect (https://appstoreconnect.apple.com): create the app.
  Bundle ID `com.openmicexplorer.app` (register it under Certificates,
  Identifiers first, with Sign in with Apple and Associated Domains
  capabilities), name "Open Mic Explorer" (reserve early, names are
  first-come), subtitle and copy from `docs/store/STORE_LISTING.md`.
  Note the numeric Apple App ID it assigns; paste it into `eas.json` at
  `submit.production.ios.ascAppId`.
- Play Console: create the app, package `com.openmicexplorer.app`, accept
  Play App Signing (default; Google holds the app signing key, EAS holds
  the upload key). Fill the Data safety form from `docs/DATA-SAFETY.md`,
  the content rating questionnaire from the same file's age rating
  section, and store listing from `docs/store/STORE_LISTING.md`. Create a
  service account for API submission when prompted by
  `eas submit` docs (https://docs.expo.dev/submit/android/), download its
  JSON key to `./play-service-account.json` (gitignored), grant it
  release access in Play Console.
- Both: set the support email (D1) and privacy policy URL (step 7).
- Time: 2 to 3 hours of form filling. Unblocks: step 10 submission.

## 6. EAS wiring

- Do, in the repo root, logged in as the `kylem_ix` Expo account:

```
npx eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
npx eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>
npx eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value <dsn from step 9>
# repeat the three for --environment preview (may point at the same project)
npx eas credentials   # let EAS create iOS distribution cert + profile, Android upload key
```

- Verify before any build: `npm run check:backend` must name the hosted
  project, and `npx expo-doctor` should pass 20/20 from your machine (two
  network checks could not run in the sandbox this pass used).
- Unblocks: step 10.

## 7. Host the web pieces

- Do: deploy per `docs/DEPLOY_WEB.md` onto stonedgoose.com: the
  association files at `stonedgoose.com/.well-known/` (domain root,
  required by both platforms; paste the SHA-256 fingerprints from Play
  Console App integrity into assetlinks.json and your Apple Team ID into
  apple-app-site-association), the deletion page at
  `stonedgoose.com/openmic/delete-account`, a privacy page at
  `stonedgoose.com/openmic/privacy` from
  `docs/privacy/PRIVACY_POLICY.md`, and a terms page at
  `stonedgoose.com/openmic/terms` from the current EULA text (1.3). Works
  on any static host or alongside whatever already serves
  stonedgoose.com; only /.well-known and /openmic/* are claimed.
- Cost: domain renewal only. Time: an hour.
- Unblocks: both store forms (privacy URL, deletion URL), universal links.

## 8. Support inbox (D1)

- Do: create the real shared inbox on the product domain (Google
  Workspace, 6 USD per user per month, or the domain host's email
  forwarding for free). Update `SUPPORT_EMAIL` in `src/lib/support.ts`,
  commit, and enter the same address in both consoles.
- Unblocks: honest support contact in review; Apple tests it.

## 9. Sentry project

- Do: at https://sentry.io create org + React Native project (free tier
  fine to start). Copy the DSN into the EAS env vars (step 6). Create an
  auth token (org: project:releases scope) and set SENTRY_ORG,
  SENTRY_PROJECT, SENTRY_AUTH_TOKEN as EAS secrets so builds upload
  source maps.
- Time: 30 minutes. Unblocks: readable crash reports from day one.

## 10. Build and submit, in order

```
# sanity
npm run typecheck && npm run lint && npm test
npm run check:backend

# iOS to TestFlight
npx eas build --profile testflight --platform ios
npx eas submit --profile production --platform ios --latest

# Android to Internal testing
npx eas build --profile production --platform android
npx eas submit --profile production --platform android --latest
```

- In App Store Connect: add the build to TestFlight, fill "What to test"
  from `docs/store/STORE_LISTING.md`, add internal testers, and for
  external testers submit for TestFlight review with the demo credentials
  from `REVIEW_NOTES.md` (production passwords, step 3) in the review
  notes.
- In Play Console: the submit lands on the internal track; add tester
  emails to the internal testers list and share the opt-in link.
- Time: builds 15 to 30 minutes each; TestFlight external review usually
  under 24 hours; Play internal track is immediate.

## 11. Before pressing submit, moderation must be live

- Do: on the production project, make your own account an admin:
  follow "Onboard an admin" in `docs/admin/RUNBOOK.md` (admin_invite from
  the SQL editor with your uuid), enroll MFA on your Supabase dashboard
  account, and once every admin has app-side MFA enrolled flip
  enforcement: `update admin.security_settings set require_aal2 = true;`
  (it ships off). Verify the in-app Moderation screen appears on your
  Profile tab and a test report round-trips (the loop in
  `docs/TEST-PLAN.md` section 6).
- This satisfies the 24-hour takedown expectation with or without the
  future web console (D4).

## 12. Screenshots

- Capture from the seeded preview build, dark frames, one caption line,
  per the shot list in `docs/store/STORE_LISTING.md`.
- Required sizes: App Store 6.9 inch (1320 x 2868) mandatory, 6.5 inch
  (1284 x 2778 or 1242 x 2688) recommended; Play phone 1080 x 1920
  minimum (16:9 to 2:1 accepted), 7 inch and 10 inch tablet sets, plus
  the 1024 x 500 feature graphic Play requires.

## First five things to do

1. Start Apple organization enrollment (step 1); D-U-N-S is the long pole.
2. Start Play organization verification (step 2) the same day.
3. Create the support@stonedgoose.com and legal@stonedgoose.com inboxes
   (D1; the domain decision D3 is made) so steps 7 and 8 and both store
   forms can use them.
4. Create the Supabase production project and push migrations (step 3).
5. Restrict the Google Maps key (step 4).
