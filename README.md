# Open Mic Finder

Find local open mics for music, comedy, and poetry. Sign up for a slot without leaving the app. Producers keep listings fresh and manage the night.

Read PROJECT.md for the full brief, phase plan, and progress log. Read ARCHITECTURE.md for the stack and decisions. Read docs/STEP0_PROPOSAL.md for the approved schema and version plan.

## Development setup

Prerequisites: Node 22+, Docker (for local Supabase).

```bash
npm install
cp .env.example .env
npm run db:start        # local Supabase; copy the printed anon key into .env
npm start               # Expo dev server
```

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
