# Data safety: fill-in ready answers for both stores

One page to answer Google Play's Data safety form and Apple's privacy
nutrition labels from, verified against the code on 2026-08-08. The
question-by-question Play walkthrough lives in
`docs/store/DATA_SAFETY_ANSWERS.md` and the Apple manifest source in
`docs/privacy/APPLE_PRIVACY.md`; this file is the summary you can hold
while filling either form, and the three documents agree. If they ever
stop agreeing, the code wins and all three get fixed.

## The one-paragraph truth

The app collects: email (sign-in), display name and handle, year of birth
(18 gate), optional bio and social links, optional profile photo, a
user-entered home area geocoded on device and stored privately, signups,
favorites, attendance plans, user reports, device push tokens, and crash
logs (Sentry, crash only). Foreground precise location is used transiently
for "near me" and never stored server side. Nothing is sold, nothing is
shared for advertising, there are no ad or analytics SDKs, and there is no
cross-app tracking. All traffic is TLS. Deletion is in-app (two taps from
Settings) and on the web, and it hard-deletes sign-in data and anonymizes
history.

## Google Play Data safety form

| Form question                          | Answer                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collects or shares required data types | Yes                                                                                                                                                   |
| Encrypted in transit                   | Yes                                                                                                                                                   |
| Deletion path offered                  | Yes; in-app and web URL `https://stonedgoose.com/openmic/delete-account`                                                                              |
| Data collected                         | Approximate location (ephemeral), Precise location (ephemeral), Name, Email, User IDs, Date of birth (year), Photos (optional), Other UGC, Crash logs |
| Data shared with third parties         | None (Sentry and Supabase are service providers under the form's definition, not sharing)                                                             |
| Data sold                              | No                                                                                                                                                    |
| Tracking / advertising ID              | No                                                                                                                                                    |

Per-type detail (purpose, optionality, ephemerality):
`docs/store/DATA_SAFETY_ANSWERS.md`.

## Apple privacy nutrition labels

| Label section          | Entries                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Data linked to you     | Email, Name, Coarse location (stored home area), User content, Year of birth, User ID, Device push token |
| Data not linked to you | Crash data (Sentry, unlinked configuration)                                                              |
| Data used to track you | None                                                                                                     |
| Precise location       | Used, App functionality, not stored, not linked (transient query input)                                  |

App-level `PrivacyInfo.xcprivacy` is declared inline in `app.json`
(`ios.privacyManifests`): NSPrivacyTracking false, no tracking domains,
collected data types matching the table above, and required-reason APIs
UserDefaults CA92.1, FileTimestamp C617.1, DiskSpace E174.1,
SystemBootTime 35F9.1. Per-SDK audit: `docs/privacy/SDK_MANIFEST_AUDIT.md`.

## Sentry configuration that keeps these answers true

`src/lib/sentry.ts` initializes with the DSN only: no session replay, no
profiling, no personally identifying context beyond the anonymized event.
Crash data is declared in both forms as collected, crash purposes only,
not used for tracking. If you ever enable Sentry performance tracing or
add an analytics SDK, both store forms and the privacy manifest must be
updated in the same change.

## Age rating questionnaire inputs (both stores)

Answer from these facts rather than from a target tier:

- User-generated content: yes, with moderation, reporting, and blocking.
- Profanity or crude humor: possible in UGC and inherent to comedy
  contexts; answer "infrequent/mild" where the scale allows.
- Alcohol references: venues include bars; the app neither sells nor
  promotes alcohol. Answer references "infrequent/mild" if asked.
- Violence, sexual content, gambling, drugs: none in app content.
- Unrestricted web access: no (no in-app browser beyond auth flows).
- Purchases: none. Ads: none. Tracking: none.
- The app's own age gate is 18, server enforced
  (`supabase/tests/age-gate.test.sql`), which is stricter than any tier
  either questionnaire will return. State it in the review notes.

## Support and policy URLs both forms ask for

| Field              | Value                                                                                        | Status                                                             |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Privacy policy URL | `https://stonedgoose.com/openmic/privacy` (copy: `docs/privacy/PRIVACY_POLICY.md`)           | Owner must host before submission                                  |
| Support URL        | `https://stonedgoose.com/openmic` (or a support page under it)                               | Owner must host                                                    |
| Support email      | `SUPPORT_EMAIL` in `src/lib/support.ts`, currently the placeholder `support@stonedgoose.com` | Owner decision 1; change the constant and the store forms together |
| Web deletion URL   | `https://stonedgoose.com/openmic/delete-account`                                             | Owner must deploy (docs/DEPLOY_WEB.md)                             |
