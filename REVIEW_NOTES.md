# Review Notes

This file is for App Store and Play reviewers, and for anyone evaluating a build. It always reflects the current state of the app. Demo credentials and flow walkthroughs are added as the features ship.

## Current state: Phase 2 (discovery)

Working now: everything from Phase 1, plus the core discovery loop. The Discover tab has a clustered map and a list view of nearby mics, filter chips (discipline, day of week, radius, free or paid, signup method, time of day), search by city or venue, and a "near me" button that requests foreground location only after an explained tap. Every listing opens a detail screen with plain-English recurrence, the next night, the signup method explained, cost, set length, venue facts, a directions handoff, the last-confirmed freshness badge, and a "something wrong with this listing" flag flow. Listings are cached for offline reading.

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
- **Android maps note.** The map uses Apple Maps on iOS with no key. Android builds need a Google Maps API key in app.json (android.config.googleMaps.apiKey) at EAS build time; without it the Android map view is blank (list view still works).
- **Blocking.** Blocks are enforced server side: a blocked user's profile disappears from the blocker's queries in both directions, and a performer cannot join lists run by a producer with whom a block exists in either direction.

## Temporary screens (must be empty before any store submission)

- Favorites tab (arrives with notifications work)
- My Mics tab (producer tools arrive in Phase 3)

## Running locally

See README.md. With Docker available: `npm run db:start`, then copy the printed anon key into `.env`. Without Docker: `scripts/db/verify-local.sh` verifies the entire database layer (migrations, seed, RLS tests) against system Postgres.
