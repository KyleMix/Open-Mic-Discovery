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
- **Dual roles.** One account can hold Performer and Producer together (onboarding, or later from the My Mics tab). There are no separate account types.
- **Freshness badge.** Green within 14 days of producer confirmation, amber to 45, gray after or never-confirmed. Confirmation is one tap and server-stamped: it cannot be backdated or forged, so the badge is trustworthy.
- **Signup windows.** Signups open at each mic's configured offset and close at showtime (or its close offset), enforced by row level security, not just UI.
- **Signup lifecycle.** First-come and reserved-slot mics confirm instantly in arrival order until capacity, then waitlist. Lottery mics hold entries until the host draws; the draw randomizes server side with a visible shuffle, fills capacity slots, and waitlists the rest. Status changes push notify the performer (subject to their preferences).
- **This night vs all future.** Producer edits from the Manage screen apply to this and all future nights (untouched future nights move or regenerate; cancelled nights, single-night edits, and nights with signups are never clobbered). Single-night actions (cancel with reason, restore, override title/cost) live on each night's row.
- **Claiming.** Signed-in users claim unclaimed listings with a verification note; an admin reviews (My Mics tab shows the queue for admins). Approval transfers control, grants the producer role, and closes competing claims.
- **Reporting and blocking.** Report is available on every listing (Report abusive content) and on performer rows in the producer's list; reports offer an inline block. Blocks are enforced server side in both directions: profiles disappear from each other's queries and blocked performers cannot join that producer's lists. Unblock lives in Settings. Data-quality flags ("time is wrong", "mic is dead") are a separate flow on each listing.
- **Moderation.** The automated filter screens all free text; clean content goes live instantly, matches are held. Admins work the queue (held content, reports, flags) at Profile, Moderation queue, with a 24-hour response target.
- **Account deletion.** Profile tab, Settings, Delete account (two taps from settings root), with typed confirmation. Deletion is immediate: personal data and the sign-in are removed; anonymized signup-history rows remain (documented in docs/COMPLIANCE.md).
- **Location.** Requested only on the Discover locate tap or when enabling nearby alerts, foreground only, with in-context explanations. Denial leaves the app fully usable, centered on Seattle.
- **Producer Pro.** Performing and discovery are free forever; listing creation, one-tap confirm, and cancellations are free for producers. Pro gates signup list management (draw, reorder, statuses, waitlist promotion; free producers see their roster read-only) and listing analytics. Restore Purchases is on the paywall and in Settings. In development builds without RevenueCat keys, Pro is unlocked for testing and labeled as such.
- **Paid reserved slots.** Mics that charge performers state the cost with explicit copy that payment happens at the venue or with the host, never inside the app (Apple 3.1.5(a)).
- **Offline.** Listing data is cached and readable without a connection; writes need connectivity and fail with clear messages.

## Build-time notes for reviewers and testers

- Android maps need a Google Maps API key at build time (`android.config.googleMaps.apiKey`); iOS uses Apple Maps with no key.
- Sign in with Apple and Google require provider credentials in Supabase Auth; email/password always works.
- Push notifications require a physical device and an EAS project id; every flow degrades quietly without them.
- New listings default to the America/Los_Angeles timezone (the launch region); timezone selection is planned before multi-region expansion.

## Temporary screens

None. All tabs and screens are functional (the Phase 0 PhaseShell component has been removed).

## Running locally

See README.md. With Docker: `npm run db:start`, copy the anon key into `.env`. Without Docker: `scripts/db/verify-local.sh` verifies the entire database layer (migrations, seed, 99 pgTAP tests) against system Postgres. Maestro smoke flows: `e2e/`.
