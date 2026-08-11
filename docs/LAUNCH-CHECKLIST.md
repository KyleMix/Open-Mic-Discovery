# Launch checklist: everything only you can do

Ordered handoff for getting Open Mic Explorer into TestFlight and Google
Play Internal Testing. Written 2026-08-08 by the store readiness pass so
you can work top to bottom without opening the code. Everything code-side
is done and verified; every step here needs your identity, your card, or
your decision. `docs/store/SUBMISSION_CHECKLIST.md` is the older, longer
runbook; where they disagree (it predates the Explorer rebrand and still
says "openmicfinder" bundle ids in places), THIS file is current.

## State of play, 2026-08-09

Done, and not blocking anything:

- The app codebase. Strict TypeScript, zero lint errors, 493 Jest tests,
  708 pgTAP assertions, RLS on every table, the Guideline 1.2 set (EULA
  gate, report, block, moderation queue, in-app deletion, content filter),
  privacy manifest, error boundary. Verified on a rebuilt database.
- Web home decided and swept through the code:
  www.stonedgooseproductions.com/open-mics.
- Contact address decided and in the app and EULA:
  kyle@stonedgooseproductions.com. No mailbox to create.
- The website, verified live against the deployed site on 2026-08-09, not
  taken on trust: /open-mics, /open-mics/map, /open-mics/privacy and
  /open-mics/terms all 200; /open-mics/delete-account 307s to its trailing
  slash and then 200s; both legal pages carry their real text.
  `/.well-known/apple-app-site-association` returns 200 with
  `content-type: application/json`, no extension and no redirect, which is
  the check that decides whether iOS will associate the domain at all.
  Both association files still carry their TODO_ placeholders and the
  deletion page still carries `YOUR-PROJECT-REF`, so nothing was invented
  to look finished.

  Use the TRAILING SLASH form in Play Console's data deletion field:
  `https://www.stonedgooseproductions.com/open-mics/delete-account/`. It
  answers 200 directly, and it is already what the Edge Function default
  and the documented `DELETE_PAGE_URL` secret use, which is the URL that
  goes into deletion confirmation emails.

  One gap remains, and it is mine: `/open-mics/mic/<id>` returns 404.
  Those are the URLs the app generates when someone shares a mic, and a
  recipient without the app installed hits nothing. I dropped that job
  when scaling the website prompt down to the announcement and did not
  flag the omission. Not urgent, because deep links cannot verify until
  `TODO_TEAM_ID` is real, but it must be done before any mic link is
  shared publicly. Fix: one static landing page plus a `_redirects` rule
  for `/open-mics/mic/*`, since a static export cannot pre-render unknown
  uuids.

- EAS project already exists and is linked: owner `kylem_ix`, projectId
  `b44e6a07-5276-481b-9679-8e3e1e681692`. No `eas init` needed.
- The reviewer seed, the legal export, and this checklist.

### Pre-launch audit, 2026-08-11 (updates the numbers above)

A full pre-launch audit ran on 2026-08-11 (report at `AUDIT-REPORT.md`).
It found no code-shaped launch blocker: the blockers are all owner-only
account and deploy steps, listed in the steps below and unchanged by the
audit. Current verification, superseding the 2026-08-09 line above: 554
Jest tests, 806 pgTAP assertions, typecheck and lint clean, on a rebuilt
database.

Four additive migrations were applied and are already in the chain (no
separate action, `supabase db push` runs them in order). None changes a
table shape, so none needs a type regeneration:

- `20260811000100_search_hides_hidden_hosts` closes a leak where a
  banned or unapproved host's stage name stayed readable through
  `series_search`.
- `20260811000200_profiles_cannot_self_delete` stops a user setting
  their own `deleted_at` and freezing their profile. Deletion still runs
  through `delete_account_for` (RLS-bypassing), unaffected.
- `20260811000300_defense_in_depth_revokes` takes back write grants no
  policy uses (and `EXECUTE` on `delete_account_for`), leaving the
  guest-share `anon` insert on `share_events` in place.
- `20260811000400_search_and_queue_indexes` adds trigram indexes for the
  people searches and partial indexes for the moderation queue. Applied
  as plain `CREATE INDEX` because a fresh project's tables are empty; if
  you ever apply them to an already-populated database out of band,
  build each with `CREATE INDEX CONCURRENTLY` instead.

The launch blockers the audit flagged are the owner-only items already
in this checklist: the two `.well-known` association placeholders (step
7), the deletion-page `data-function-url` (step 3 / step 7), the
`eas.json` `ascAppId` (step 5), the support mailbox (step 8), the Maps
key restriction (step 4), and rotating the admin password published in
`REVIEW_NOTES.md` (do this when you seed production, step 3). The audit
also lists stale docs to reconcile before filling the store forms; see
`AUDIT-REPORT.md` section 6.

The critical path, and what is genuinely parallel:

```
D-U-N-S  ->  Apple enrollment  ->  iOS build  ->  TestFlight
         ->  Play enrollment   ->  app signing key -> assetlinks fingerprint
Supabase production  ->  reviewer accounts  ->  Android APK on a real phone
         (this track needs NOTHING from Apple, Google, or D-U-N-S)
```

The thing worth knowing: testing the real app is not blocked on any store
account. A production Supabase project plus the existing EAS project gets
an installable Android APK, because EAS generates its own Android keystore
and Google Play is not involved in a direct install. Only iOS device builds
need Apple.

Three placeholders are waiting on accounts that do not exist yet, and each
unblocks at a different moment:

| Placeholder                    | Where                                        | Unblocked by                                                        |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------- |
| `data-function-url`            | website delete-account page                  | Supabase production project (step 3)                                |
| `TODO_TEAM_ID`                 | `web/.well-known/apple-app-site-association` | Apple enrollment (step 1)                                           |
| `TODO_SHA256_CERT_FINGERPRINT` | `web/.well-known/assetlinks.json`            | Play app signing, which needs a first upload (step 2, then step 10) |

## Decisions blocking or shaping steps below, up front

- **D1, support inbox (blocks step 8).** The app's one support address is
  the constant `SUPPORT_EMAIL` in `src/lib/support.ts`, set to
  `kyle@stonedgooseproductions.com` per the domain decision. The inbox does not
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
  under the publisher domain, subpath `www.stonedgooseproductions.com/open-mics`. The
  sweep is done: universal links associate with host `www.stonedgooseproductions.com`
  (association files MUST be served from `www.stonedgooseproductions.com/.well-known/`,
  the domain root, not the subpath), app pages live under `/open-mics/`
  (mic links, delete-account, privacy, terms), the app strips the prefix
  via `src/app/+native-intent.tsx`, EULA 1.3 records the new addresses,
  and support/legal addresses are `kyle@stonedgooseproductions.com` and
  `kyle@stonedgooseproductions.com`. Your remaining part is hosting (step 7) and
  creating the inboxes (step 8); do not submit until the pages are live,
  because Apple follows the links.
- **D4, moderation console: DECIDED 2026-08-08.** Submit without the web
  console. The in-app `/admin` screen plus `docs/admin/RUNBOOK.md` are
  the takedown path (works, audited as of this pass) and satisfy Apple's
  24-hour requirement. The console gets built after launch on the
  already-shipped database layer.

**Long-form version of steps 1 to 5:** `docs/FIRST-FIVE-WALKTHROUGH.md`,
which adds the exact forms, values, and traps, and notes the one thing that
reorders the list (both stores need a D-U-N-S number, one serves both, and
it takes up to five days).

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
  (runs the full migration chain in order, including the stewardship one,
  D2, and the four 2026-08-11 pre-launch audit migrations).
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
- Seed reviewer data, in this order (do NOT run `supabase/seed.sql`
  against production; its own header forbids it, because its passwords are
  published in this repo and it puts two accounts on the admin allowlist):
  1. Install a preview build pointed at production, sign up two accounts
     through the app itself, using plus addressing on the one real
     mailbox so the confirmation emails actually arrive
     (`kyle+reviewer.performer@stonedgooseproductions.com` and
     `kyle+reviewer.producer@stonedgooseproductions.com`), accept the
     EULA, finish
     onboarding, and pick the performer and producer roles respectively.
     Passwords are yours; they go in App Store Connect review notes and
     your password manager, never in git.
  2. Run the content seed with those addresses:
     `psql "$PRODUCTION_DATABASE_URL" -v performer_email="'kyle+reviewer.performer@stonedgooseproductions.com'" -v producer_email="'kyle+reviewer.producer@stonedgooseproductions.com'" -f supabase/seed/production-reviewer-seed.sql`
     It creates 8 venues and 10 listings (4 owned by the reviewer
     producer, all four signup methods represented), refuses to run if
     either account is missing, and is safe to re-run.
  3. Confirm nights exist, which is what a reviewer actually sees:
     `select count(*) from mic_occurrences o join mic_series s on s.id=o.series_id where s.id::text like '5eed%' and o.starts_at > now();`
     A fresh run produces roughly 100. Zero means
     `private.generate_occurrences()` has not run yet.
  4. Record the two addresses and passwords in `REVIEW_NOTES.md`, replacing
     the local-only demo table.
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

- Do: deploy per `docs/DEPLOY_WEB.md` onto www.stonedgooseproductions.com: the
  association files at `www.stonedgooseproductions.com/.well-known/` (domain root,
  required by both platforms; paste the SHA-256 fingerprints from Play
  Console App integrity into assetlinks.json and your Apple Team ID into
  apple-app-site-association), the deletion page at
  `www.stonedgooseproductions.com/open-mics/delete-account`, a privacy page at
  `www.stonedgooseproductions.com/open-mics/privacy` from
  `docs/privacy/PRIVACY_POLICY.md`, and a terms page at
  `www.stonedgooseproductions.com/open-mics/terms` from the current EULA text (1.3). Works
  on any static host or alongside whatever already serves
  www.stonedgooseproductions.com; only /.well-known and /open-mics/* are claimed.
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

## 11b. Before the app goes PUBLIC (not before TestFlight)

The reviewer seed puts ten invented venues in the production database so a
reviewer does not open an empty app. That is correct for TestFlight and Play
internal testing. It is not correct for a public release: The Rusty Fret and
Blue Heron Coffee do not exist, and a performer driving to one is real harm
from fake data in a live product.

Since the app launches with no listings by design (mic owners add their own
rooms), delete the seed content when you move from testing to public
availability. The exact four statements are in the header of
`supabase/seed/production-reviewer-seed.sql`; every seeded id carries a
`5eed` prefix so the removal cannot touch anything a real person created.

Keep the two reviewer accounts. They own nothing once the listings are gone.

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
3. Create the kyle@stonedgooseproductions.com and kyle@stonedgooseproductions.com inboxes
   (D1; the domain decision D3 is made) so steps 7 and 8 and both store
   forms can use them.
4. Create the Supabase production project and push migrations (step 3).
5. Restrict the Google Maps key (step 4).
