# Open Mic Explorer

Find local open mics for music, comedy, and poetry. Sign up for a slot without leaving the app. Producers keep listings fresh and manage the night.

Read PROJECT.md for the full brief, phase plan, and progress log. Read ARCHITECTURE.md for the stack and decisions. Read docs/STEP0_PROPOSAL.md for the approved schema and version plan.

## Development setup

Prerequisites: Node 22+, Docker (for local Supabase).

```bash
npm install
npm run dev:up          # starts local Supabase and writes .env for you
npm run web             # fastest loop: the app in a browser
```

`npm run dev:up` reads the running Supabase stack and fills in
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, so the anon key
never has to be copied by hand.

Testing on an Android emulator or a phone needs a different Supabase host than
the browser does. **docs/DEV_PC.md** covers all three, plus demo accounts, what
degrades where, and the common failure symptoms.

Pulled new migrations? `npm run dev:up` applies them as part of starting up
(`npm run db:migrate` on its own keeps your data, `npm run db:reset` rebuilds
from scratch). `supabase start` alone boots the database it already has, which
leaves it behind the repo.

## Testing the app as the owner

Sign in with the owner email and the account arrives complete: performer,
producer, and admin. Profile tab, **Testing tools** then builds whole
situations in one tap (a mic starting in 90 minutes with a roster on it, a
lottery waiting to be drawn, a full moderation queue) and removes them again
just as easily. See docs/TEST_KIT.md.

## Checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

## Structure

- `src/app/` Expo Router routes (thin: routing and composition only)
- `src/components/` shared UI
- `src/features/` feature modules (added per phase)
- `src/lib/` Supabase client, query client, env
- `src/theme/` design tokens (dark-first, per-discipline accents)
- `supabase/` migrations, RLS tests, Edge Functions, seed data
- `e2e/` Maestro flows
