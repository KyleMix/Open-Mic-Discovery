# Review Notes

This file is for App Store and Play reviewers, and for anyone evaluating a build. It always reflects the current state of the app. Demo credentials and flow walkthroughs are added as the features ship.

## Current state: Phase 3 (producer tools)

Working now: everything from Phases 1 and 2, plus producer tools. The My Mics tab is a producer dashboard: create a listing with a plain-language recurrence builder (weekly, every other week, monthly ordinals like "first and third Sunday", live plain-English preview), pick an existing venue or add a new one by dropping a pin on a map, one-tap "confirm this listing is accurate" (server-stamped, cannot be backdated), pause or resume a listing, edit the series for this-and-all-future nights, and per-night actions: cancel a single night with a reason, restore it, or override one night's title and cost. Unclaimed listings show a claim flow on their detail screen; admins see the pending claim queue at the top of My Mics and approve or reject in place. Performer accounts can enable the producer role from the same tab (dual roles are the normal case).

Working from Phase 2: The Discover tab has a clustered map and a list view of nearby mics, filter chips (discipline, day of week, radius, free or paid, signup method, time of day), search by city or venue, and a "near me" button that requests foreground location only after an explained tap. Every listing opens a detail screen with plain-English recurrence, the next night, the signup method explained, cost, set length, venue facts, a directions handoff, the last-confirmed freshness badge, and a "something wrong with this listing" flag flow. Listings are cached for offline reading.

Sign in with Apple and Google Sign-In are implemented in code but require provider credentials (Apple Services ID, Google OAuth client) configured in Supabase before they function. Local development uses email and password.

## Demo credentials

Created by the database seed (`supabase/seed.sql`). Local development only; production demo accounts will be created before store submission.

| Role                             | Email                        | Password            |
| -------------------------------- | ---------------------------- | ------------------- |
| Performer                        | performer@demo.openmic.local | demo-pass-1234      |
| Producer                         | producer@demo.openmic.local  | demo-pass-1234      |
| Dual role                        | dual@demo.openmic.local      | demo-pass-1234      |
| Admin (moderation)               | admin@demo.openmic.local     | demo-pass-1234      |
| Owner/tester (all roles + admin) | kylewmixon@gmail.com         | openmic-tester-2026 |

## Non-obvious flow walkthroughs

- **EULA gate.** Every new account must accept the EULA before onboarding; acceptance version and timestamp are recorded on the profile (timestamp is stamped server side and cannot be forged). If a newer EULA version is published later, existing users are routed back to the gate on next launch and must re-accept before reaching the app.
- **Age gate.** Onboarding requires a birth year; accounts under 17 cannot complete setup. The app will be rated 17+ for comedy content.
- **Dual roles.** Onboarding allows enabling Performer and Producer together; both can also coexist on one account later. There are no separate account types.
- **Signup windows.** A performer can only join a list between the series' "signup opens" offset and its close time. This is enforced in the database (row level security), not just in the UI.
- **Location.** Location permission is requested only when the user taps the locate button on Discover, with the reason stated in the accessibility hint and the OS prompt copy. Background location is never requested. If denied, discovery works centered on Seattle with a note explaining how to enable it.
- **Freshness badge.** Green within 14 days of producer confirmation, amber to 45 days, gray after that or when never confirmed. Staleness is shown honestly instead of hidden.
- **Flagging vs reporting.** The listing flag flow ("time is wrong", "this mic is dead") is data quality and goes to listing_flags. Abuse reports are a separate flow arriving in Phase 5 with its own reasons and moderation queue.
- **This night vs all future.** Editing from the mic's Manage screen applies to this and all future nights (the schedule reconciles: untouched future nights move or regenerate; cancelled nights, individually edited nights, and nights with signups are never clobbered). Editing from a single night's row applies to that night only, via override fields. The UI states this on both paths.
- **Claiming.** Anyone signed in can claim an unclaimed listing with a short verification note. Claims are reviewed by an admin (v1 policy); approval transfers control, grants the producer role, and closes competing claims. Enforced in a SECURITY DEFINER function, admin-only.
- **Confirmation is unforgeable.** The freshness badge comes from a server-stamped timestamp; any attempt to write it directly gets overwritten with the server time and the caller's identity.
- **Timezone note.** New listings currently default to America/Los_Angeles (the seeded region). Timezone selection UI is planned before expansion beyond the Pacific Northwest.
- **Android maps note.** The map uses Apple Maps on iOS with no key. Android builds need a Google Maps API key in app.json (android.config.googleMaps.apiKey) at EAS build time; without it the Android map view is blank (list view still works).
- **Blocking.** Blocks are enforced server side: a blocked user's profile disappears from the blocker's queries in both directions, and a performer cannot join lists run by a producer with whom a block exists in either direction.

## Temporary screens (must be empty before any store submission)

- Favorites tab (arrives with notifications work)
- My Mics tab (producer tools arrive in Phase 3)

## Running locally

See README.md. With Docker available: `npm run db:start`, then copy the printed anon key into `.env`. Without Docker: `scripts/db/verify-local.sh` verifies the entire database layer (migrations, seed, RLS tests) against system Postgres.
