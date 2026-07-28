# Review Notes

This file is for App Store and Play reviewers, and for anyone evaluating a build. It always reflects the current state of the app. Demo credentials and flow walkthroughs are added as the features ship.

## Current state: Phase 0 (foundation only)

The app is a navigation shell with no features yet. All four tabs (Discover, Favorites, My Mics, Profile) intentionally render a `PhaseShell` screen stating what will live there. These are development-phase stand-ins, tracked here as required by our own rule in `src/components/phase-shell.tsx`: none may remain by Phase 8, and this section must be empty of PhaseShell entries before any store submission.

Current PhaseShell screens:

- Discover tab (map and list arrive in Phase 2)
- Favorites tab (arrives with notifications work)
- My Mics tab (producer tools arrive in Phase 3)
- Profile tab (auth arrives in Phase 1)

## Demo credentials

To be added in Phase 1:

- Performer account
- Producer account
- Dual-role account

## Non-obvious flow walkthroughs

None yet. Every non-obvious flow gets a written walkthrough here as it ships.

## Running locally

See README.md.
