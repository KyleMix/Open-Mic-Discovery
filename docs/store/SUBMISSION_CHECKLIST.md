# App Store and Google Play Submission Checklist

The complete owner runbook for getting Open Mic Finder onto the Apple App
Store and Google Play. Work top to bottom; each phase depends on the ones
before it. Items marked (done) are already implemented in this repo and are
listed so you can verify them, not redo them.

Companion files: store copy in `STORE_LISTING.md`, guideline mapping in
`../COMPLIANCE.md`, privacy form answers in `../privacy/APPLE_PRIVACY.md`
and `../privacy/PLAY_DATA_SAFETY.md`, hostable pages in
`../privacy/PRIVACY_POLICY.md` and `ACCOUNT_DELETION_PAGE.md`, reviewer
notes and demo-account plan in the repo root `REVIEW_NOTES.md`.

## Phase 1: Accounts and identity

- [ ] Finalize the app name. The repo ships as "Open Mic Finder"
      (`app.json` name, store copy, EULA, privacy policy). If you change
      it, sweep `app.json`, `docs/store/STORE_LISTING.md`, both privacy
      docs, and the EULA seed before building.
- [ ] Enroll in the Apple Developer Program (developer.apple.com, 99 USD
      per year). Enrolling as a company requires a D-U-N-S number; as an
      individual, your legal name shows as the seller.
- [ ] Create a Google Play Console developer account (play.google.com/console,
      25 USD one time). Note: personal accounts created after November 2023
      must run a closed test with at least 12 testers for 14 days before
      production access is granted. Budget this into the timeline or
      register as an organization.
- [ ] In App Store Connect: create the app record with bundle id
      `com.openmicfinder.app`, primary language, and the name and subtitle
      from `STORE_LISTING.md`. Reserve the name early; names are
      first-come in App Store Connect.
- [ ] In Play Console: create the app with package `com.openmicfinder.app`.
- [ ] Buy or confirm the product domain (the support address, privacy
      policy, and deletion page all live on it).

## Phase 2: Production backend (Supabase)

- [ ] Create a hosted Supabase project (paid tier recommended: the free
      tier pauses idle projects, which would take the app down).
- [ ] Decide on the stewardship migration
      (`supabase/migrations/20260804000100_discovery_stewardship.sql`,
      approved but never applied per DECISIONS_NEEDED item 12). Apply it
      with the rest, then regenerate types (`npm run db:types` against the
      hosted project) and commit them.
- [ ] `supabase link` then `supabase db push` to apply all migrations.
- [ ] Run the pgTAP suite against a staging copy if possible (358 tests
      currently pass locally via `scripts/db/verify-local.sh`).
- [ ] Deploy the push-sender Edge Function:
      `supabase functions deploy push-sender`.
- [ ] Create the vault secrets `push_sender_url` and `push_sender_token`
      (per the header of migration 20260803000700) so the pg_cron push
      schedule can invoke the function.
- [ ] Add `openmic://reset-password` to the hosted project's Auth redirect
      allow list (forgot-password flow).
- [ ] Configure Auth providers:
  - [ ] Sign in with Apple: create a Services ID and key in the Apple
        Developer portal, add them to Supabase Auth. Apple requires this
        provider because Google Sign-In is offered (Guideline 4.8).
  - [ ] Google Sign-In: OAuth client in Google Cloud Console, added to
        Supabase Auth.
  - [ ] Confirm email confirmations, rate limits, and SMTP sender (use a
        custom SMTP domain so emails do not land in spam).
- [ ] Do NOT run `supabase/seed.sql` in production (it is local-only demo
      data). Seed the launch city listings through the admin import path.
- [ ] Create fresh production reviewer accounts by hand (performer,
      producer, dual role, admin) with strong passwords, and update the
      credentials table in `REVIEW_NOTES.md`. Both stores require working
      demo credentials for review.
- [ ] Turn on Supabase daily backups and point-in-time recovery if the
      plan includes it.

## Phase 3: Third-party services

- [ ] Sentry: create the project, copy the DSN (becomes
      `EXPO_PUBLIC_SENTRY_DSN`).
- [ ] Google Maps. A key is **already committed** at `app.json`
      `android.config.googleMaps.apiKey`, and that is normal: an Android Maps
      SDK key is compiled into the APK manifest by design and is extractable
      from any installed build in about a minute. It is not a secret and
      rotating it changes nothing on its own. What matters is the
      restriction, which cannot be verified from the repository, so it gets
      checked here (audit finding F-003):
  - [ ] Application restriction: type "Android apps", package
        `com.openmicexplorer.app`, with **both** the debug SHA-1 and the EAS
        release keystore SHA-1 (`eas credentials`).
  - [ ] API restriction: "Maps SDK for Android" only.
  - [ ] Billing alert set, so a scraped key shows up as an email rather than
        as an invoice.
  - [ ] Verified on a real preview build, not a simulator: a wrong SHA-1
        renders blank tiles on release builds only.
  - [ ] Record the date verified here: ______. Re-check after any keystore
        regeneration, which invalidates the SHA-1.
  - iOS uses Apple Maps and needs no key.
- [ ] Expo/EAS:
  - [ ] `eas init` to create the project (writes the project id into
        `app.json`; commit it).
  - [ ] `eas credentials` to set up iOS distribution certs and the Android
        keystore (let EAS manage them).
  - [ ] Set EAS secrets: `EXPO_PUBLIC_SUPABASE_URL`,
        `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SENTRY_DSN`,
        `EXPO_PUBLIC_REVENUECAT_IOS_KEY`,
        `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, plus the Sentry auth token
        for source map uploads.
  - [ ] If you want OTA JS fixes, run `eas update:configure` (adds the
        updates URL and runtime version policy to `app.json`); the build
        channels in `eas.json` are already set up.
- [ ] Push notifications: upload the APNs key to Expo (via
      `eas credentials`) and confirm FCM is wired for Android.

## Phase 4: Legal and web presence

- [ ] Stand up the support inbox and finalize the address. Placeholder is
      `support@openmicfinder.app` in `src/lib/support.ts` (DECISIONS_NEEDED
      item 11). If the address changes, update that file, both hostable
      pages, and the store listings. Someone must actually read it: the
      moderation target is 24 hours.
- [ ] Host the privacy policy from `../privacy/PRIVACY_POLICY.md` at a
      public URL. The same text ships inside the app (done); the URL is
      what the store forms need.
- [ ] Host the account deletion page from `ACCOUNT_DELETION_PAGE.md` at a
      public URL (Play requires it; Apple reviewers look for it).
- [ ] Optional but recommended: host the terms of use on the web too (the
      in-app EULA gate is done and is what Apple 1.2 requires).

## Phase 5: Final app config and art

- [ ] Final art per `../ASSET_PROMPTS.md`: 1024 iOS icon, Android adaptive
      icon set (foreground, background, monochrome), splash icon. Current
      assets are correctly sized placeholders; replace the artwork, keep
      the filenames.
- [ ] Verify the Android push notification small icon on a real device (a
      build-config pass wired `expo-notifications` to the monochrome icon
      with the music-blue tint; confirm it renders as a clean glyph, not a
      blob, in the status bar).
- [ ] Confirm `app.json` before the production build: name, version 1.0.0,
      bundle id and package, EAS project id present, Maps key present.
- [ ] Run `npx expo prebuild --clean` locally once and eyeball the
      generated iOS Info.plist and AndroidManifest for permissions: only
      location (when in use), photo library, and notifications should
      appear (calendar and record-audio are blocked on purpose).

## Phase 6: Builds and real-device testing

- [ ] Pre-build checks, all of which run offline except the last:
  - [ ] `npm run typecheck`, `npm run lint`, `npm test`.
  - [ ] `npx supabase test db` (or `scripts/db/verify-local.sh` without
        Docker) so every migration applies from empty and the pgTAP suite
        passes.
  - [ ] `npx eas env:list --environment production` shows both
        `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Both
        the `production` and `testflight` profiles now name that environment
        explicitly (`eas.json`); without it a build can ship with no backend
        configured and launch straight to an error screen (audit F-006).
  - [ ] `npm run check:backend` against the production URL.
  - [ ] `npx expo-doctor` reports 20 of 20. Two of its checks call out to
        the network (the config schema check and the React Native Directory
        check) and fail in sandboxed environments with a proxy error rather
        than a real finding, so this one has to run on an unrestricted
        connection (audit F-017).
  - [ ] `npm audit`: as of the 2026-08-07 audit this reports 34 advisories,
        30 moderate and 4 high, and **none of them ship in the app bundle**.
        Every high (`fastify`, `fast-uri`, `find-my-way`, `js-yaml`) arrives
        through `@supabase/postgres-meta`, a devDependency, or through
        `@eslint/eslintrc` and `@expo/xcpretty`. The moderate `uuid` advisory
        arrives via `xcode` under `@expo/config-plugins`, which runs at
        prebuild. **Do not run `npm audit fix --force`**: it downgrades
        `expo-splash-screen` to an SDK 55 version and breaks the project.
        Re-triage only if a new advisory names a runtime dependency
        (audit F-016).
- [ ] `eas build --profile production --platform ios` and
      `--platform android`.
- [ ] Upload to TestFlight (happens via `eas submit` or automatically) and
      to a Play internal testing track.
- [ ] Full pass on physical devices, both platforms, using the production
      backend:
  - [ ] Sign up (email), Sign in with Apple, Google Sign-In.
  - [ ] EULA gate, age gate, onboarding with home area, dual roles.
  - [ ] Discovery: list, map with clustered markers, filters, search,
        guest browsing without an account.
  - [ ] Listing detail, directions handoff, add to calendar, flag,
        report, block (verify the blocked user vanishes both directions).
  - [ ] Producer: create a series (recurrence builder), confirm listing,
        cancel a night, this-night vs all-future edit, poster upload.
  - [ ] Signups: walk-in list and name-draw mics, realtime roster
        updates on two devices at once, on-deck push, status pushes.
  - [ ] Push notifications arrive with the branded icon and deep-link to
        the right mic from cold start.
  - [ ] Purchases: none exist in the app; there is nothing to test here.
  - [ ] Account deletion end to end, then confirm the email can register
        again.
  - [ ] Offline: airplane mode keeps cached listings readable; writes
        fail with clear messages.
  - [ ] Accessibility: VoiceOver (iOS) and TalkBack (Android) through
        discovery and signup; dynamic type at max size.
- [ ] Run the Maestro e2e flows in `e2e/` against a preview build.
- [ ] Fix what falls out, rebuild, retest. Do not submit a build you have
      not run on a physical device.

## Phase 7: App Store Connect (Apple)

- [ ] App Information: name, subtitle, category (Entertainment, secondary
      Music), content rights declaration.
- [ ] Pricing: Free. Availability: launch countries.
- [ ] In-App Purchases: none. The app sells nothing; skip this section.
      submission (first subscription must be submitted with an app
      version), with review screenshot and notes.
- [ ] Age rating questionnaire. Answer from the evidence below, not from a
      target tier. This list used to say "land 17+", a tier Apple retired
      when it moved to 13+/16+/18+, and it disagreed with `STORE_LISTING.md`,
      which says 16+. Apple rejects dishonest ratings after the fact, so the
      answers matter more than the number they produce:
  - [ ] User generated content: **yes**, and unmoderated-by-default in the
        sense the questionnaire means. Listings, venue names and parking
        notes, bios, stage names, credit names, and poster images are all
        user supplied (`banned_terms` is a first-pass filter, not review).
  - [ ] Profanity or crude humor: **infrequent/mild**. Comedy is a
        first-class discipline (the `discipline` enum) and the EULA warns
        about adult language.
  - [ ] Unrestricted web access: **yes**. Profiles and credits link out to
        Instagram, TikTok, YouTube, Spotify, Apple Music, and arbitrary
        `https://` sites, opened via `src/components/social-links.tsx`.
  - [ ] Horror, violence, sexual content, gambling, contests, drugs,
        alcohol references: **none** as app content.
  - [ ] In-app purchases: **none**. Ads: **none**. Tracking: **none**.
  - [ ] Whatever tier those answers produce, expect a reviewer who reads the
        EULA to see "at least 18 years old" and ask why the store rating is
        lower. The answer is that the in-app gate is the stricter control
        and is enforced server side
        (`supabase/migrations/20260729000200_age_gate_18.sql`). Decide
        before submitting whether you would rather rate 18+ and skip the
        conversation; that is an owner decision, see `docs/audit/PLAN.md`.
- [ ] App Privacy section: enter exactly what
      `../privacy/APPLE_PRIVACY.md` says (data linked to identity: email,
      name, coarse location, user content, birth year, device id/push
      token; no purchases, no tracking). Set the privacy policy URL.
- [ ] Screenshots: 6.9 inch (required) and 6.5 inch, from the shot list in
      `STORE_LISTING.md`, dark frames, real seeded data.
- [ ] App Review Information:
  - [ ] Demo credentials from `REVIEW_NOTES.md` (performer, producer, and
        dual-role accounts on the production backend).
  - [ ] Notes: paste the UGC moderation summary (EULA gate, report and
        block everywhere, automated filter, 24-hour moderation queue,
        account deletion path: Profile > Settings > Delete account), and
        that paid reserved-slot mics collect money at the venue, never in
        the app (3.1.5(a)).
  - [ ] Contact phone and email that a reviewer can actually reach.
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption` is already false
      in `app.json` (standard HTTPS only), so no documentation is needed.
- [ ] Submit for review. First reviews typically take 1 to 3 days. If
      rejected, read the exact guideline cited, fix or rebut in the
      Resolution Center, and resubmit; do not argue ratings.

## Phase 8: Google Play Console

- [ ] Store listing: app name, short and full description from
      `STORE_LISTING.md`, app icon 512, feature graphic 1024x500,
      screenshots (phone required; 7 and 10 inch tablet recommended).
- [ ] App content declarations (all under Policy > App content):
  - [ ] Privacy policy URL.
  - [ ] Data safety form: enter exactly what
        `../privacy/PLAY_DATA_SAFETY.md` says, including the account
        deletion URL (the hosted `ACCOUNT_DELETION_PAGE.md`).
  - [ ] Content rating questionnaire (IARC): answer from the same evidence
        as the Apple questionnaire above (UGC yes, mild profanity yes,
        unrestricted web access yes, nothing else). IARC tiers are its own
        scheme and differ by territory, so record what it returns rather
        than aiming at a number.
  - [ ] Target audience: 18 and over, matching the in-app gate; never
        select children. Do not select 17, which the earlier draft of this
        checklist offered: the gate is 18 and the two should agree.
  - [ ] Ads declaration: no ads.
  - [ ] News app: no. Health: no. Government: no.
  - [ ] App access: provide the reviewer credentials from
        `REVIEW_NOTES.md` with step-by-step access notes.
- [ ] Monetization: none. The app sells nothing; skip this section.
      activate it.
- [ ] Countries and pricing: free, launch countries.
- [ ] Release path: internal testing (validate install and IAP), then
      closed testing if your account requires the 12-tester 14-day gate,
      then production. Staged rollout at 10 to 20 percent first is wise.
- [ ] Play review is mostly automated and usually clears within hours to
      2 days; policy strikes come from the declarations not matching app
      behavior, which is why the Data safety form must mirror reality.

## Phase 9: After approval

- [ ] Watch Sentry for crash spikes on day one; ship JS fixes over EAS
      Update, native fixes as store builds.
- [ ] Staff the moderation queue: the app promises a 24-hour response
      target on reports and held content.
- [ ] Keep `REVIEW_NOTES.md`, the privacy docs, and the in-app policy in
      lockstep with any feature that touches data collection; both stores
      re-review updates against the declarations.
- [ ] Keep demo accounts alive and their credentials current for every
      future review.
- [ ] Renew: Apple membership yearly; keystore and APNs keys are managed
      by EAS, do not delete the EAS project.
