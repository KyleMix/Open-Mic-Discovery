# App store status: where the app stands, 2026-08-10

A dated snapshot answering one question: what stands between this repo and
the two app stores, and which of those things need the owner rather than
code. Written while the D-U-N-S number is processing. The step-by-step
instructions live in `docs/LAUNCH-CHECKLIST.md` (authoritative, work top to
bottom) and `docs/FIRST-FIVE-WALKTHROUGH.md` (long-form for steps 1 to 5).
This file does not replace them; it tells you where you are on the map.

## State of play

The code side of shipping is done and verified:

- All phases 0 through 8 complete per the PROJECT.md Progress Log.
- 554 Jest tests, 790 pgTAP assertions, strict typecheck and lint clean,
  CI green (typecheck, lint, Jest, timezone re-run, pgTAP, Maestro e2e).
- EAS project created and linked: owner `kylem_ix`, projectId
  `b44e6a07-5276-481b-9679-8e3e1e681692`. No `eas init` needed.
- Bundle id `com.openmicexplorer.app` on both platforms, iOS privacy
  manifest complete in `app.json`, universal link and app link config in
  place, in-app account deletion shipped, Guideline 1.2 moderation set
  shipped.
- Store paperwork drafted: `docs/store/STORE_LISTING.md`,
  `docs/DATA-SAFETY.md`, `docs/privacy/PRIVACY_POLICY.md`, EULA 1.3,
  `REVIEW_NOTES.md`.
- The app is fully free by owner decision (2026-07-30). There is no
  payments SDK, no IAP, and therefore no Apple 3.1.2 or Play billing
  surface to configure. No payment APIs are needed, ever, for v1.

Everything that remains needs the owner's identity, card, or accounts.

## The critical path

```
D-U-N-S  ->  Apple enrollment  ->  iOS build  ->  TestFlight
         ->  Play enrollment   ->  app signing key -> assetlinks fingerprint
Supabase production  ->  reviewer accounts  ->  Android APK on a real phone
         (this track needs NOTHING from Apple, Google, or D-U-N-S)
```

## Blocked on the D-U-N-S number (wait, then act)

1. **Apple Developer Program**, enroll as Organization at
   developer.apple.com/programs/enroll. 99 USD per year, verification 1 to
   3 days after D-U-N-S, sometimes a phone call. Unblocks the Team ID,
   bundle id registration, App Store Connect, TestFlight, the APNs push
   key, and Sign in with Apple credentials.
2. **Google Play Console**, create as Organization at
   play.google.com/console/signup. 25 USD once, verification 1 to 3 days,
   may also ask for the D-U-N-S. An organization account skips the
   12-tester 14-day closed-test gate that personal accounts carry.

Both use the same D-U-N-S number. Start both enrollments the day it
arrives.

## Not blocked on D-U-N-S: do these now

In checklist order (details in `docs/LAUNCH-CHECKLIST.md` steps 3 to 9):

1. **Supabase production project** (paid tier, us-west, from 25 USD per
   month). Link and `db push` the full migration chain, confirm buckets
   `avatars` and `posters`, add redirect URLs
   `openmicexplorer://auth-callback` and `openmicexplorer://reset-password`,
   configure custom SMTP, create the `push_sender_url` and
   `push_sender_token` vault secrets, deploy the `deletion-request` and
   `push-sender` Edge Functions. This is the biggest unblocked item and it
   also unblocks real-device Android testing: a preview APK pointed at
   production installs directly with no store account involved.
2. **Restrict the Google Maps Android key** in `app.json`. It ships in
   every binary and sits in git history, so treat it as public:
   application restriction Android apps with package
   `com.openmicexplorer.app` plus both SHA-1s, API restriction Maps SDK
   for Android only. Rotate if it was ever unrestricted. iOS uses Apple
   Maps and needs no key.
3. **Host the web pieces** on www.stonedgooseproductions.com per
   `docs/DEPLOY_WEB.md`: association files at the domain root
   `/.well-known/`, and delete-account, privacy, and terms under
   `/open-mics/`. Known gap: `/open-mics/mic/<id>` returns 404 today and
   needs a static landing page plus a `_redirects` rule before any mic
   link is shared publicly.
4. **Support inbox** `kyle@stonedgooseproductions.com` (decision D1).
   Update `SUPPORT_EMAIL` in `src/lib/support.ts` only if the address
   changes.
5. **Sentry project**: DSN into the EAS env vars, plus SENTRY_ORG,
   SENTRY_PROJECT, and SENTRY_AUTH_TOKEN as EAS secrets so builds upload
   source maps.
6. **EAS wiring**: `eas env:create` for `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_SENTRY_DSN` in both
   the production and preview environments, then `eas credentials`.
7. **Store art**. The icon and splash in `assets/images/` are correctly
   sized placeholders awaiting final art (`docs/ASSET_PROMPTS.md`). Every
   existing screenshot is 780 x 1688, which is undersized for both
   stores: Apple requires 1320 x 2868 for the mandatory 6.9 inch set, and
   Play requires at least 1080 x 1920 plus a 1024 x 500 feature graphic
   and tablet sets. Capture fresh ones from the seeded preview build per
   the shot list in `docs/store/STORE_LISTING.md`.

## APIs and credentials to set up, in one list

| Credential | Where it comes from | Where it goes | Gated by |
| --- | --- | --- | --- |
| Supabase URL + anon key | Supabase dashboard, production project | EAS env vars | Nothing |
| Google Maps Android key restriction | console.cloud.google.com | Same key stays in `app.json` | Nothing |
| SMTP provider key | Resend, Postmark, or SES | Supabase Auth SMTP settings | Nothing |
| Sentry DSN + auth token | sentry.io | EAS env vars and secrets | Nothing |
| Sign in with Apple: Services ID + private key | developer.apple.com | Supabase Auth, Apple provider | Apple enrollment |
| Google OAuth client id + secret | console.cloud.google.com | Supabase Auth, Google provider | Nothing (Google Cloud only) |
| APNs push key | developer.apple.com | Expo, via `eas credentials` | Apple enrollment |
| FCM v1 service-account JSON | console.cloud.google.com | Expo, via `eas credentials` | Nothing (Google Cloud only) |
| Play Console service-account JSON | Play Console prompt, per Expo submit docs | `./play-service-account.json`, gitignored | Play enrollment |
| Numeric Apple App ID | App Store Connect after creating the app record | `eas.json` at `submit.production.ios.ascAppId` | Apple enrollment |

Push delivery is the Expo Push Service, so no `google-services.json` or
`GoogleService-Info.plist` lands in the repo; the APNs key and FCM JSON
are uploaded to Expo once through `eas credentials`.

## The five placeholders that hard-block submission

| Placeholder | File | Unblocked by |
| --- | --- | --- |
| `PASTE-NUMERIC-APP-ID-FROM-APP-STORE-CONNECT` | `eas.json` | App Store Connect app record |
| `TODO_TEAM_ID` | `web/.well-known/apple-app-site-association` | Apple enrollment |
| `TODO_SHA256_CERT_FINGERPRINT` | `web/.well-known/assetlinks.json` | Play App Signing, after the first upload |
| `YOUR-PROJECT-REF` data-function-url | `web/delete-account/index.html` | Supabase production project |
| `play-service-account.json` absent | repo root, gitignored | Play Console service account |

## After the accounts exist

`docs/LAUNCH-CHECKLIST.md` steps 5 and 10 to 12 take over: create both
store records, fill the Data safety and content rating forms from
`docs/DATA-SAFETY.md`, build and submit with the commands in step 10,
onboard yourself as admin and flip MFA enforcement before pressing
submit (step 11), and delete the reviewer seed content before public
release, not before TestFlight (step 11b).

One stale document to ignore: `docs/store/SUBMISSION_CHECKLIST.md`
predates the Explorer rebrand and the payments removal (it still names
RevenueCat env vars that exist nowhere in the code). Where it disagrees
with `docs/LAUNCH-CHECKLIST.md`, the launch checklist wins.
