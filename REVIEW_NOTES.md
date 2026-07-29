# Review Notes

This file is for App Store and Play reviewers, and for anyone evaluating a build. It always reflects the current state of the app.

## Current state: feature complete (Phases 0 through 8 built)

Every screen is functional; there are no placeholder screens, dead links, or stubbed tabs. Remaining before store submission are owner-side setup steps only (hosted backend, store accounts, provider credentials, final art): the full checklist lives in `docs/store/STORE_LISTING.md`.

## Demo credentials

Created by the database seed (`supabase/seed.sql`). Local development only; production demo accounts will be created on the hosted project before store submission and updated here.

| Role                             | Email                        | Password            |
| -------------------------------- | ---------------------------- | ------------------- |
| Performer                        | performer@demo.openmic.local | demo-pass-1234      |
| Producer                         | producer@demo.openmic.local  | demo-pass-1234      |
| Dual role                        | dual@demo.openmic.local      | demo-pass-1234      |
| Admin (moderation)               | admin@demo.openmic.local     | demo-pass-1234      |
| Owner/tester (all roles + admin) | kylewmixon@gmail.com         | openmic-tester-2026 |

## Walkthrough of every non-obvious flow

- **EULA gate.** Every new account accepts the EULA before onboarding; the accepted version and a server-stamped timestamp are recorded. Publishing a newer EULA version routes existing users back to the gate on next launch.
- **Age gate.** Onboarding requires a birth year; under-17 cannot complete setup. Rated 17+ for comedy content.
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
- **Event posters.** Producers add or replace a poster from the Manage screen; it renders at the top of the public mic page. Posters live in a public storage bucket where each producer can only write inside their own folder (storage RLS). Posters are covered by the existing listing flag and report flows.
- **Personalized discovery.** Discover opens in list view (map is one tap away), centered on the home area, with the discipline chips pre-selected to what the performer does (multiple supported). The list sorts by soonest upcoming night first, nearest first within the same day. Every default is one tap to override and never overrides a choice already made.
- **Producer Pro.** Performing and discovery are free forever; listing creation, one-tap confirm, and cancellations are free for producers. Pro gates signup list management (draw, reorder, statuses, waitlist promotion; free producers see their roster read-only) and listing analytics. Restore Purchases is on the paywall and in Settings. In development builds without RevenueCat keys, Pro is unlocked for testing and labeled as such.
- **Paid reserved slots.** Mics that charge performers state the cost with explicit copy that payment happens at the venue or with the host, never inside the app (Apple 3.1.5(a)).
- **Offline.** Listing data is cached and readable without a connection; writes need connectivity and fail with clear messages.
- **Simple filters.** Discover shows two plain rows: what kind of mic (single tap: All, Music, Comedy, Poetry, Other) and when (Any day, Today, Weekend), plus Free and an All filters sheet. The sheet asks one labeled question per section (days, time, cost, how you get on stage, distance) in plain language. Short option sets are big tappable chips; the signup-style question is a multi-select dropdown that reads "Any way" until something is picked. Distances read in miles; the server still works in km. Signup methods use plain names everywhere: Walk-in list, Name draw, Book ahead, Invite only.
- **Dropdown selects.** Fields with many options use a shared dropdown control (trigger opens a bottom sheet of large options with one-line explanations): producer form start time, signup method, and signup-open lead time, the filter sheet signup style, and the nearby-alert radius in notification preferences.
- **Roster safety net.** On the night-of list, performed and no-show rows keep an undo action that puts the performer back on the list, and all roster views show plain-language statuses.
- **Profile customization.** Profile tab, Edit profile: photo (square-cropped from the library, stored in the public avatars bucket under the user's own folder, enforced by storage RLS) plus Instagram, TikTok, YouTube, and website. Handle fields accept @names or pasted URLs and normalize; only https links are accepted (database check constraints back this). Links render as tappable chips on the profile. Editing display name or bio re-enters the moderation filter, same as onboarding.

## Build-time notes for reviewers and testers

- Android maps need a Google Maps API key at build time (`android.config.googleMaps.apiKey`); iOS uses Apple Maps with no key.
- Sign in with Apple and Google require provider credentials in Supabase Auth; email/password always works.
- Push notifications require a physical device and an EAS project id; every flow degrades quietly without them.
- New listings default to the America/Los_Angeles timezone (the launch region); timezone selection is planned before multi-region expansion.

## Temporary screens

None. All tabs and screens are functional (the Phase 0 PhaseShell component has been removed).

## Running locally

See README.md. With Docker: `npm run db:start`, copy the anon key into `.env`. Without Docker: `scripts/db/verify-local.sh` verifies the entire database layer (migrations, seed, 99 pgTAP tests) against system Postgres. Maestro smoke flows: `e2e/`.
