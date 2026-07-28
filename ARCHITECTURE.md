# Architecture

Living document. Records the stack, the pinned version combination, and decisions with their reasoning. Update whenever a decision here changes.

## Stack

| Layer         | Choice                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Client        | Expo SDK 57, React Native 0.86, React 19, TypeScript strict                                                                                    |
| Routing       | Expo Router (file based, typed routes enabled)                                                                                                 |
| Server state  | TanStack Query v5 (all data from Supabase lives here)                                                                                          |
| Client state  | Zustand v5 (UI-only state; server data never goes in Zustand)                                                                                  |
| Backend       | Supabase: Postgres + PostGIS, Auth, Storage, Realtime, Edge Functions                                                                          |
| Maps          | react-native-maps with supercluster-based clustering (Phase 2)                                                                                 |
| Location      | expo-location, foreground only, requested in context                                                                                           |
| Notifications | expo-notifications + Expo Push (Phase 4+)                                                                                                      |
| Payments      | RevenueCat for Producer Pro subscription; paid slots use an external processor, never IAP (Apple 3.1.5(a), see docs/STEP0_PROPOSAL.md flag F4) |
| Errors        | Sentry via @sentry/react-native config plugin (added Phase 1)                                                                                  |
| Build/ship    | EAS Build, EAS Submit, EAS Update                                                                                                              |
| Tests         | Jest + jest-expo + React Native Testing Library; Maestro for e2e; pgTAP for RLS                                                                |

## The architecture and animation combination (pinned)

**New Architecture with Reanimated 4 + react-native-worklets.** React Native 0.82+ removed the legacy architecture, so on SDK 57 (RN 0.86) this is the only supported combination. Reanimated 3 is not an option on this stack.

Pinned pairs that must move together, never via a transitive bump:

- `react-native-reanimated` 4.5.0 + `react-native-worklets` 0.10.0 (the SDK 57 template pairing; upgrade only both at once, only to a pairing Expo documents as SDK-compatible)
- All `expo-*` packages upgrade via `npx expo install`, never by hand, so they stay SDK-matched.

Renovate/dependabot, when added, must be configured to exclude these from automatic major bumps.

## Decisions log

- **2026-07-28, TypeScript ~6.0.3.** Step 0 proposed ~5.9, but the SDK 57 template pins ~6.0 (still the standard TypeScript compiler). We follow the template pin. npm `latest` is now TypeScript 7 (the Go compiler); we do not adopt it until the Expo toolchain does.
- **2026-07-28, React Compiler experiment stays on.** The SDK 57 template enables `experiments.reactCompiler`. Kept: it removes a class of manual memoization work. If it miscompiles anything we turn it off in app.json and note it here.
- **2026-07-28, dark-first enforced at the config level.** `userInterfaceStyle` is `dark`, splash and adaptive icon backgrounds use the app background color, and the navigation theme derives from `src/theme/tokens.ts`. Tokens are the single source of truth for color, spacing, and type; per-discipline accent colors live there and are contrast-tested in `src/theme/tokens.test.ts`.
- **2026-07-28, screens are thin.** Files under `src/app/` only route and compose; all real UI and logic lives in `src/components` and `src/features/<feature>/` so it is testable without the router.
- **2026-07-28, Supabase env via EXPO_PUBLIC\_ vars.** The anon key and URL are build-time public values (`src/lib/env.ts`). Real secrets live in EAS secrets and Supabase Edge Function config only. `.env` is gitignored; `.env.example` documents the shape.
- **2026-07-28, lazily created Supabase client.** `src/lib/supabase.ts` constructs the client on first use so module import never throws in tests. It gains the generated `Database` type parameter in Phase 1.

## Repo layout

See docs/STEP0_PROPOSAL.md section 4 for the full annotated tree. Summary: `src/app` is routes only, `src/features` holds feature modules, `src/lib` holds clients, `src/theme` holds tokens, `supabase/` holds migrations (with RLS policies and pgTAP tests alongside), Edge Functions, and seed data.
