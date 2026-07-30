# Review Notes

This file is for App Store and Play reviewers, and for anyone evaluating a build. It always reflects the current state of the app.

## Current state: feature complete (Phases 0 through 8 built)

Every screen is functional; there are no placeholder screens, dead links, or stubbed tabs. Remaining before store submission are owner-side setup steps only (hosted backend, store accounts, provider credentials, final art): the full checklist lives in `docs/store/STORE_LISTING.md`.

## Demo credentials

Created by the database seed (`supabase/seed.sql`). Local development only; production demo accounts will be created on the hosted project before store submission and updated here.

| Role                             | Email                                | Password                    |
| -------------------------------- | ------------------------------------ | --------------------------- |
| Performer                        | performer@demo.openmicexplorer.local | demo-pass-1234              |
| Producer                         | producer@demo.openmicexplorer.local  | demo-pass-1234              |
| Dual role                        | dual@demo.openmicexplorer.local      | demo-pass-1234              |
| Admin (moderation)               | admin@demo.openmicexplorer.local     | demo-pass-1234              |
| Owner/tester (all roles + admin) | kylewmixon@gmail.com                 | openmicexplorer-tester-2026 |

## Payment model

The app sells nothing. There is no in-app purchase, no subscription, and no
payment SDK in the build. Every feature is free to every account.

Some open mics in the real world charge performers for reserved stage
slots. Those fees are payment for a real-world service at a physical venue,
handled entirely outside the app (at the venue or with the host), per
guideline 3.1.5(a). The app only displays that such a cost exists and
states in plain copy that payment never happens inside the app. There is no
in-app way to pay a producer or venue, and no such purchase will be added
to IAP.

Free for everyone: discovery, performing, signups, listing creation, one-tap
freshness confirmation, cancellations, running the signup list on the night,
and listing analytics.

## Dual-role walkthrough (performer and producer, one account)

Demo credentials are in the table above (production demo accounts will be
created on the hosted project before submission and the table updated).

1. Sign in as the performer account (or create a fresh account: accept the
   EULA, pick Performer, enter a handle, home area, and birth year).
2. Discover tab: browse the list, open a mic, note the freshness badge and
   plain-language schedule. Tap Sign up on an open night; your spot and
   status appear immediately.
3. Sign out (Profile tab), then sign in as the producer account.
4. My Mics tab: open a listing, tap Confirm accurate (one tap, the badge
   updates), open tonight's list, run the lottery draw or reorder, and mark
   performed or no-show.
5. Dual role on one account: the dual demo account holds both roles at
   once, or add the Producer role to any performer account from the My
   Mics tab. There are no separate account types.
6. Nothing is locked: every producer tool, including running the signup
   list on the night and listing analytics, is available to any account.
   There is no purchase anywhere in the app.

## Account deletion, in two taps from Settings

Profile tab, Settings, Delete account, typed confirmation. Immediate:
sign-in removed, profile anonymized. The web path for uninstalled users is
https://openmicfinder.app/delete-account (same server-side deletion,
covered by `supabase/tests/deletion.test.sql`).

## Where the legal links live

Settings, under Legal (`src/features/legal/links.ts`): Privacy Policy and
Terms of Use (EULA), both tappable, opening in the in-app browser, with a
friendly inline message when offline. The same EULA text is shown and
accepted in-app at signup.

## Walkthrough of every non-obvious flow

- **EULA gate.** Every new account accepts the EULA before onboarding; the accepted version and a server-stamped timestamp are recorded. Publishing a newer EULA version routes existing users back to the gate on next launch.
- **Age gate.** Onboarding requires a birth year; under-18 cannot complete setup, enforced by a database trigger as well as the client (`supabase/tests/age-gate.test.sql`). The store rating targets Apple's 16+ tier for comedy content; the in-app 18 gate is the stricter limit and governs actual account creation.
- **Dual roles.** One account can hold Performer and Producer together. Roles can be enabled at onboarding, later from the My Mics tab (producer), with one tap on any signup card (performer), or from Profile, Edit profile, What you do, which also edits performing disciplines. There are no separate account types.
- **Freshness badge.** Green within 14 days of producer confirmation, amber to 45, gray after or never-confirmed. Confirmation is one tap and server-stamped: it cannot be backdated or forged, so the badge is trustworthy.
- **Signup windows.** Signups open at each mic's configured offset and close at showtime (or its close offset), enforced by row level security, not just UI.
- **Signup lifecycle.** First-come and reserved-slot mics confirm instantly in arrival order until capacity, then waitlist. Lottery mics hold entries until the host draws; the draw randomizes server side with a visible shuffle, fills capacity slots, and waitlists the rest. Status changes push notify the performer (subject to their preferences).
- **This night vs all future.** Producer edits from the Manage screen apply to this and all future nights (untouched future nights move or regenerate; cancelled nights, single-night edits, and nights with signups are never clobbered). Single-night actions (cancel with reason, restore, override title/cost) live on each night's row.
- **Claiming.** Signed-in users claim unclaimed listings with a verification note; an admin reviews (My Mics tab shows the queue for admins). Approval transfers control, grants the producer role, and closes competing claims.
- **Reporting and blocking.** Report is available on every listing (Report abusive content) and on performer rows in the producer's list; reports offer an inline block. Blocks are enforced server side in both directions: profiles disappear from each other's queries and blocked performers cannot join that producer's lists. Unblock lives in Settings. Data-quality flags ("time is wrong", "mic is dead") are a separate flow on each listing.
- **Moderation.** The automated filter screens all free text; clean content goes live instantly, matches are held. Admins work the queue (held content, reports, flags) at Profile, Moderation queue, with a 24-hour response target.
- **Account deletion.** Profile tab, Settings, Delete account (two taps from settings root), with typed confirmation. Deletion is immediate: personal data and the sign-in are removed; anonymized signup-history rows remain (documented in docs/COMPLIANCE.md).
- **Location.** Discovery centers on the profile's home area by default, so device location is optional. It is requested only on the Discover locate tap or when enabling nearby alerts without stored home coordinates, foreground only, with in-context explanations. Denial leaves the app fully usable.
- **Home area (required, private).** Every profile provides a city and state, or a 5-digit ZIP, at onboarding (database-enforced). It is geocoded on device into private coordinates and appears nowhere public: no view exposes any home area column (pgTAP-verified). Only the owner sees it, labeled as private, on their own profile.
- **On deck.** From the night-of list, the producer taps the megaphone on a confirmed performer to put them on deck: the roster row lights up for everyone in real time, the performer's signup card shows "You are on deck", and a push goes out through the outbox (respecting their signup-updates preference). Only the series owner or an admin can set it, enforced server side. Tapping again takes them off deck without re-notifying.
- **Day-of favorite reminders.** Already wired: an hourly job queues one push per favorited mic on the day it happens (deduped, preference-gated), delivered by the push-sender Edge Function. Reminder times now render in the mic's own timezone.
- **Add to calendar.** Every mic page with an upcoming night has "Add to my calendar": on iOS and Android it opens the system event sheet prefilled (Apple Calendar or Google Calendar, whichever the person uses); on web it opens the Google Calendar template. No calendar permission is requested; the system UI owns the write.
- **Event posters.** Producers add or replace a poster from the Manage screen; it renders at the top of the public mic page and as a thumbnail on Discover list cards and Favorites, so every mic can show its own face. Posters live in a public storage bucket where each producer can only write inside their own folder (storage RLS). Posters are covered by the existing listing flag and report flows.
- **Personalized discovery.** Discover opens in list view (map is one tap away), centered on the home area, with the discipline chips pre-selected to what the performer does (multiple supported). The list sorts by soonest upcoming night first, nearest first within the same day. Every default is one tap to override and never overrides a choice already made.
- **Nothing is paid.** Every feature is free to every account: discovery, signups, listing creation, one-tap confirm, cancellations, running the signup list on the night (draw, reorder, statuses, waitlist promotion), and listing analytics. The app contains no in-app purchase and no payment SDK.
- **Paid reserved slots.** Mics that charge performers state the cost with explicit copy that payment happens at the venue or with the host, never inside the app (Apple 3.1.5(a)).
- **Offline.** Listing data is cached and readable without a connection; writes need connectivity and fail with clear messages.
- **Simple filters.** Discover shows two plain rows: what kind of mic (single tap: All, Music, Comedy, Poetry, Other) and when (Any day, Today, Weekend), plus Free and an All filters sheet. The sheet asks one labeled question per section (days, time, cost, how you get on stage, distance) in plain language. Short option sets are big tappable chips; the signup-style question is a multi-select dropdown that reads "Any way" until something is picked. Distances read in miles; the server still works in km. Signup methods use plain names everywhere: Walk-in list, Name draw, Book ahead, Invite only.
- **Dropdown selects.** Fields with many options use a shared dropdown control (trigger opens a bottom sheet of large options with one-line explanations): producer form start time, signup method, and signup-open lead time, the filter sheet signup style, and the nearby-alert radius in notification preferences.
- **Roster safety net.** On the night-of list, performed and no-show rows keep an undo action that puts the performer back on the list, and all roster views show plain-language statuses.
- **Forgot password.** Sign in, Forgot password emails a reset link that deep-links back into the app (openmicexplorer://reset-password) to set a new password. The link is single-use and device-bound (PKCE): opened elsewhere or expired, the screen explains and offers a fresh link.
- **Timezone per listing.** The producer form picks the mic's IANA timezone (defaulting to the device zone); occurrence generation follows it across daylight saving. Changing it regenerates untouched future nights, same as any schedule edit.
- **Blocked list shows names.** Blocking snapshots the display name onto the block row (server-side trigger, spoof-proof, pgTAP-tested), so Settings shows who is blocked without re-exposing the blocked profile.
- **Distance in search.** Search results show miles from the same center discovery uses (home area, or the device position after a locate tap). Distance math stays in PostGIS (search_mics takes an optional center).
- **Venue-local dates.** Every occurrence date and time renders in the mic's own timezone (a Thursday 7:30 PM Seattle mic reads Thursday everywhere, not Friday from a device set to UTC). Applies to the mic page, signup card, producer night rows, and list fallbacks.
- **Notification taps.** Tapping a push (signup update, favorite reminder, on deck, new mic nearby) opens the mic it is about, including from a cold start.
- **Keyboard behavior.** Long forms scroll the focused field above the keyboard, and every bottom-sheet with an input (report, flag, claim, cancel night, delete account) rides up with the keyboard instead of hiding under it.
- **Motion.** Tabs cross-fade, pushed screens slide in, and cards and buttons dip slightly under the finger (Reanimated). All subtle; no motion is load-bearing.
- **Profile customization.** Profile tab, Edit profile: photo (square-cropped from the library, stored in the public avatars bucket under the user's own folder, enforced by storage RLS) plus Instagram, TikTok, YouTube, and website. Handle fields accept @names or pasted URLs and normalize; only https links are accepted (database check constraints back this). Links render as tappable chips on the profile. Editing display name or bio re-enters the moderation filter, same as onboarding.

## Build-time notes for reviewers and testers

- Android maps need a Google Maps API key at build time (`android.config.googleMaps.apiKey`); iOS uses Apple Maps with no key.
- Sign in with Apple and Google require provider credentials in Supabase Auth; email/password always works, including the in-app password reset.
- Push notifications require a physical device and an EAS project id; every flow degrades quietly without them.
- New listings carry a timezone picker (US zones) that defaults to the device's zone, falling back to America/Los_Angeles. The reset-link email flow requires the app's `openmicexplorer://` scheme; on the hosted project, add the scheme URL to the Supabase Auth redirect allowlist.

## Temporary screens

None. All tabs and screens are functional (the Phase 0 PhaseShell component has been removed).

## Running locally

See README.md. With Docker: `npm run db:start`, copy the anon key into `.env`. Without Docker: `scripts/db/verify-local.sh` verifies the entire database layer (migrations, seed, 99 pgTAP tests) against system Postgres. Maestro smoke flows: `e2e/`.
