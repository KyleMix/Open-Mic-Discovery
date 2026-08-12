# Play Data Safety Form: Question-by-Question Answers

Fill the Play Console Data safety section with exactly these answers. Every
answer is derived from what the code actually does, with the implementing
file noted. Update this sheet whenever collection changes;
`docs/privacy/PLAY_DATA_SAFETY.md` holds the summary table and
`docs/privacy/SDK_MANIFEST_AUDIT.md` the SDK-level audit.

## Overview questions

**Does your app collect or share any of the required user data types?**
Yes.

**Is all of the user data collected by your app encrypted in transit?**
Yes. All traffic is HTTPS/TLS to Supabase, Expo push, and
Sentry (`src/lib/supabase.ts`, `src/lib/sentry.ts`).

**Do you provide a way for users to request that their data is deleted?**
Yes, both required paths:

- In app: Profile tab, Settings, Delete account, two taps from the settings
  root (`src/app/settings.tsx`, `delete_account()` RPC).
- Web, usable after uninstall: `https://www.stonedgooseproductions.com/open-mics/delete-account`
  (enter this URL in the form; page source `web/delete-account/index.html`,
  Edge Function `supabase/functions/deletion-request`).

Deletion is immediate: the sign-in is hard-deleted and the profile
anonymized. State in the form that anonymized event-history records are
retained for service integrity (the form's "Data retained for legitimate
business purposes" carve-out).

## Data types: collected, shared, and why

For every type below: Shared = No. Sold = No. Processed ephemerally = No
unless noted. All collection is required for the feature it powers but the
features themselves are optional, so mark Optional where noted.

**Location, Approximate location.** Collected: Yes, Required. Purpose: App
functionality. Ephemeral: No. Two flows fall under this type and the
stricter one governs the answers: the in-context "near me" tap is
transient (`src/features/discovery/location.ts`), but the required home
area is city/ZIP geocoded on device into approximate coordinates stored
privately on the profile (never exposed in any view, deleted with the
account). Stored means not ephemeral; required at onboarding means
Required. This matches the Apple declaration (Coarse Location, linked).

**Location, Precise location.** Collected: Yes, optional (users can
decline the in-context permission and the app remains fully usable).
Purpose: App functionality (nearby search). Ephemeral: Yes; precise
coordinates are used transiently for the query and never stored server
side. Background location is never requested (`app.json`:
isAndroidBackgroundLocationEnabled false).

**Personal info, Name.** Collected: Yes (display name and handle).
Purpose: App functionality (public profile). Required.

**Personal info, Email address.** Collected: Yes. Purpose: Account
management. Required. Never shown to other users (RLS-verified,
`supabase/tests/rls.test.sql`).

**Personal info, User IDs.** Collected: Yes (account id). Purpose: Account
management. Required.

**Personal info, Date of birth.** Collected: Yes (year only). Purpose:
Age gating (18, server enforced). Required. Never public; erased on
deletion.

**Personal info, Address / Phone number / Race / Religion / etc.** Not
collected. (Producer contact phone is optional producer-entered business
contact info, never exposed to non-owners; if the reviewer asks, it falls
under Personal info, Phone number: collected, optional, app functionality,
not shared. `supabase/tests/rls.test.sql` proves non-exposure.)

**Photos and videos, Photos.** Collected: Yes, optional (profile photo,
event posters). Purpose: App functionality. Library access is
permission-gated and user-initiated (`src/features/profile`,
`expo-image-picker`).

**App activity, Other user-generated content.** Collected: Yes (bios,
listings, signup entries, reports, network connections). Purpose: App
functionality. Optional. Note on connections: a connection is two account
ids and a status, created only by mutual consent, deletable by either
party at any time, and erased on account deletion. What connections see
of each other (public profile, socials, upcoming attendance) is
user-to-user visibility inside the app, not sharing with any third
party, so the Shared answer stays No.

**App activity, App interactions / Installed apps / Search history.** Not
collected. There are no analytics SDKs (`package.json`: no analytics
dependency; Sentry is crash-only).

**App info and performance, Crash logs.** Collected: Yes. Purpose:
Analytics (crash reporting only). Sentry is initialized with
sendDefaultPii false and no user identity attached
(`src/lib/sentry.ts`). Optional for the user? No (automatic), so mark
Required, ephemeral No.

**App info and performance, Diagnostics.** Not collected beyond crash
logs.

**Device or other IDs.** Collected: Yes (Expo push token). Purpose: App
functionality (notifications the user opts into). Optional. Deleted with
the account.

**Financial info.** Not collected. The app sells nothing and contains no
payment SDK. Real-world paid slots are paid at the venue, outside the app.

**Health and fitness, Messages, Contacts, Calendar, Audio, Files.** Not
collected. "Add to my calendar" opens the system calendar UI without
calendar permission (`src/features/calendar`).

## Security practices section

- Encrypted in transit: Yes.
- Deletion mechanism: Yes, with the web URL above.
- Committed to the Play Families policy: No (app is 18+ by in-app gate).
- Independent security review: No.

## Ads and tracking

- Contains ads: No.
- Data used for advertising or marketing: None.
- Data shared with third parties: None. Supabase, Expo push, and Sentry are
  service providers processing on our behalf, which the form does not count
  as sharing when disclosed this way.
