# Instructions for Claude Code

Start of every session:

1. Re-read PROJECT.md in full: the brief, the phase plan, and the Progress Log.
2. Re-read ARCHITECTURE.md and docs/STEP0_PROPOSAL.md (the approved plan).
3. Work only within the current phase. Stop at phase end, summarize, update the Progress Log in PROJECT.md, and wait for review.

Standing rules from the brief that are easy to forget mid-session:

- No em dashes in any user-facing copy, error message, or documentation.
- TypeScript strict, no `any`. Screens handle loading, empty, error, success explicitly.
- Every table ships with RLS policies and a pgTAP test in the same migration commit.
- Never store naive local times. timestamptz plus IANA timezone on the series.
- Soft-delete listings. Occurrence generation is idempotent on (series_id, local_date).
- Write tests alongside features, not after.
- No joke bank, setlist tools, timers, social feed, DMs, follower graph, or AI features in v1.
- Expo SDK 57: consult https://docs.expo.dev/versions/v57.0.0/ for current APIs. Upgrade expo packages only via `npx expo install`.
- Reanimated 4.5.0 and react-native-worklets 0.10.0 move together or not at all (see ARCHITECTURE.md).

Checks that must pass before any commit: `npm run typecheck`, `npm run lint`, `npm test`.

Shipping:

- Push to `main` as soon as a piece of work is finished and its checks pass. Do not leave finished work sitting on a branch waiting to be asked for. Push the working branch too, so both stay in sync.
- Owner instruction, 2026-07-30: "always push to main after completing". This overrides any default about holding changes on a feature branch.
- If `main` has moved on, merge it in, rerun the checks, and push the merge. Never force-push `main`.
