# REPO_PROFILE

Read-only profile of `Open-Mic-Discovery`, produced to support writing a testing strategy.
Branch `claude/repo-profile-testing-l6m597`, working tree clean, HEAD `a5bb15f`.

## Scope note, read this first

The section headings requested by this task assume a Vite plus THREE.js real-time
multiplayer game with a custom client/server wire protocol. This repository is not
that. It is an Expo SDK 57 React Native application (`package.json:16`, `package.json:63-77`)
whose backend is a managed Supabase Postgres instance driven entirely through
migrations (`supabase/migrations/`, 16 files, 2300 lines of SQL).

There is no Vite config (`ls vite.config.*` returns "No such file or directory"),
no renderer, no game loop, no bespoke wire protocol, and no authoritative server
process that this repo owns other than one 69-line Deno Edge Function.

Rather than declare four sections inapplicable, I have answered each against the
nearest real structure in this codebase and said explicitly where the mapping is
mine rather than the code's. Where the honest answer is "this concept does not
exist here," I say that instead of inventing an analogue.

---

## 1. Tooling ground truth

### package.json scripts, verbatim (`package.json:63-77`)

```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "lint": "expo lint",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "typecheck": "tsc --noEmit",
  "test": "jest",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset",
  "db:types": "supabase gen types typescript --local > src/types/database.types.ts"
}
```

### Dependencies (`package.json:5-48`)

Runtime, 42 entries. Load-bearing ones for testing purposes:

| Package                                             | Version             | Why it matters to tests                                                          |
| --------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `expo`                                              | `~57.0.8`           | Sets the Jest preset and the module resolver                                     |
| `react` / `react-native`                            | `19.2.3` / `0.86.0` | RNTL renders against these                                                       |
| `expo-router`                                       | `~57.0.8`           | Every screen is a route module, `main` is `expo-router/entry` (`package.json:3`) |
| `@supabase/supabase-js`                             | `^2.111.0`          | The entire network boundary                                                      |
| `@tanstack/react-query`                             | `^5.101.4`          | All server state                                                                 |
| `@tanstack/query-async-storage-persister`           | `^5.101.4`          | Cache persisted to device storage                                                |
| `zustand`                                           | `^5.0.14`           | Both client stores                                                               |
| `react-native-maps`                                 | `1.27.2`            | Native-only, platform-split for web                                              |
| `supercluster`                                      | `^8.0.1`            | Map marker clustering, pure JS, testable                                         |
| `react-native-purchases`                            | `^10.4.4`           | RevenueCat, native module                                                        |
| `react-native-reanimated` / `react-native-worklets` | `4.5.0` / `0.10.0`  | Pinned pair per `CLAUDE.md`                                                      |

Dev dependencies (`package.json:49-62`): `@testing-library/react-native ^14.0.1`,
`@types/jest 29.5.14`, `eslint ^9.39.5`, `eslint-config-expo ^57.0.0`,
`eslint-config-prettier ^10.1.8`, `jest ^29.7.0`, `jest-expo ^57.0.2`,
`prettier ^3.9.6`, `supabase ^2.110.0`, `typescript ~6.0.3`.

There is no `three` in the dependency tree. `grep -c '"node_modules/three"' package-lock.json`
returns `0`.

### Vite config

None. There is no bundler config of any kind checked in: no `vite.config.*`,
no `metro.config.*`, no `babel.config.*`. Metro and Babel run on Expo defaults.

### TypeScript config, verbatim (`tsconfig.json`)

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"],
    "paths": {
      "@/*": ["./src/*"],
      "@/assets/*": ["./assets/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
  "exclude": ["node_modules", "supabase/functions"]
}
```

Note `supabase/functions` is excluded (`tsconfig.json:12`), so the Edge Function is
outside typecheck. ESLint also ignores it (`eslint.config.js:10`).

### Jest config (`package.json:78-84`)

```json
"jest": {
  "preset": "jest-expo",
  "testPathIgnorePatterns": ["/node_modules/", "/e2e/"]
}
```

No `setupFiles`, no `testEnvironment` override, no `globalSetup`, and no `TZ` pin.
`grep -rn "TZ\|timezone" package.json` returns nothing. This matters, see section 6.

### CI workflow files

None. `ls .github` returns "No such file or directory". `find . -name "*.yml" -o -name "*.yaml"`
(excluding node_modules) returns only `./e2e/signup.yaml` and `./e2e/discovery.yaml`, which
are Maestro flows, not CI. **Nothing in this repository runs on push.**

### Exact commands

- **Run the app:** `npm start` (which is `expo start`). Platform variants: `npm run ios`,
  `npm run android`, `npm run web`. All require `.env` with `EXPO_PUBLIC_SUPABASE_URL`
  and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set (`src/lib/env.ts:7-22` throws otherwise), plus a
  running Supabase instance (`npm run db:start`).
- **Build it:** there is no `build` script. Native builds go through EAS using the
  profiles in `eas.json:6-20` (`development`, `preview`, `production`), invoked as
  `eas build --profile production`, which is not wrapped by any npm script. Web output is
  configured as `"output": "static"` (`app.json:29`) and would be produced by
  `npx expo export --platform web`, which is likewise not scripted.
- **Test runner installed today:** yes. Jest 29.7.0 with the `jest-expo` 57.0.2 preset
  and `@testing-library/react-native` 14.0.1. Run with `npm test`. A second, unrelated
  suite exists as pgTAP SQL under `supabase/tests/` (10 files, 1112 lines), driven by
  `supabase test db` or `scripts/db/verify-local.sh`. There is no Vitest, no Playwright,
  and no wired-up runner for the Maestro `e2e/` flows.

---

## 2. Architecture map

Three tiers, and the interesting thing is that the middle one is almost empty.

**Postgres is the application.** The business rules that matter (who may sign up
and when, what a signup's status becomes, when occurrences exist, what counts as
moderated, who owns a listing) are implemented as RLS policies, CHECK constraints,
and PL/pgSQL triggers inside `supabase/migrations/`. The client does not compute
these; it issues writes and reads whatever the server decided.

**The client is a thin read/render/dispatch layer.** Server state lives in TanStack
Query (`src/lib/query-client.ts:9-17`), keyed per feature, with the query cache mirrored
to AsyncStorage (`src/app/_layout.tsx:120,128-131`). Client-only UI state lives in two
zustand stores (`src/stores/filters.ts:59`, `src/stores/onboarding.ts:13`). Auth session
state lives in a React context fed by the Supabase auth listener
(`src/features/auth/session.tsx:14-35`). Nothing else holds state.

**The network boundary is one function.** Every outbound call goes through
`getSupabase()` (`src/lib/supabase.ts:14-25`), a lazily memoized singleton client.
Nineteen call sites across the codebase reach it and nothing else does. The only
network I/O not routed through it is `fetch(asset.uri)` for image blobs on web
(`src/features/profile/avatar.ts:33`, `src/features/producer/poster.ts:34`) and the
Expo Push API call inside the Edge Function (`supabase/functions/push-sender/index.ts:51`).

**Persistence is split three ways.** Authoritative data in Postgres; the query cache
and the auth session in AsyncStorage on device (`src/app/_layout.tsx:120`,
`src/lib/supabase.ts:17`); binary assets in two public Supabase Storage buckets
(`avatars`, `posters`).

```
Open-Mic-Discovery/
├── src/
│   ├── app/                  Expo Router routes ONLY. Every file is a screen or a
│   │                         layout. Heaviest logic concentration is here despite
│   │                         the stated convention (mic/[id].tsx is 670 lines).
│   │   ├── _layout.tsx       Root: providers, Sentry init at module scope, AuthGate
│   │   │                     redirect state machine (145 lines)
│   │   ├── (auth)/           sign-in, sign-up, eula, onboarding
│   │   ├── (tabs)/           index (Discover), favorites, producer, profile
│   │   ├── mic/[id].tsx      Listing detail. Most-churned source file (7 commits)
│   │   ├── producer/         new, [id] (manage), night/[occurrenceId], analytics/[id]
│   │   ├── admin.tsx, settings.tsx, edit-profile.tsx, paywall.tsx,
│   │   └── notification-prefs.tsx
│   ├── features/             Feature modules. Each holds queries.ts (TanStack hooks
│   │                         wrapping Supabase) plus optional pure logic modules
│   │                         and components/.
│   │   ├── auth/             api.ts (sign-in flows), queries.ts, session.tsx,
│   │   │                     validation.ts (PURE)
│   │   ├── discovery/        queries.ts, order.ts + distance.ts + freshness.ts +
│   │   │                     recurrence.ts (PURE), location.ts (expo-location),
│   │   │                     components/ incl. mic-map.tsx + mic-map.web.tsx
│   │   ├── producer/         queries.ts, rrule-builder.ts (PURE), poster.ts (I/O),
│   │   │                     components/series-form.tsx (595 lines, largest component)
│   │   ├── signups/          queries.ts (incl. the only Realtime subscription),
│   │   │                     window.ts (PURE)
│   │   ├── profile/          queries.ts, home-area.ts + social.ts (PURE),
│   │   │                     avatar.ts + geocode.ts (I/O)
│   │   ├── pro/              status.ts (PURE, injected deps), use-pro.ts (RevenueCat)
│   │   ├── safety/           queries.ts (reports, blocks, moderation, delete_account)
│   │   ├── favorites/        queries.ts
│   │   ├── notifications/    queries.ts (prefs only)
│   │   └── calendar/         calendar.ts (half pure, half native)
│   ├── lib/                  Clients and process-wide singletons. supabase.ts is the
│   │                         single network boundary. env.ts, query-client.ts,
│   │                         notifications.ts, sentry.ts.
│   ├── stores/               Two zustand stores. Client UI state only, never server
│   │                         data. filters.ts also exports pure helpers.
│   ├── theme/                Design tokens. Pure data, no React.
│   ├── components/           Shared presentational primitives: ui.tsx, glyph.tsx,
│   │                         logo.tsx.
│   └── types/database.types.ts   Generated from the schema (2715 lines). The only
│                             contract between client and server, and it is
│                             compile-time only.
├── supabase/
│   ├── migrations/           THE ACTUAL BUSINESS LOGIC. 16 ordered SQL files:
│   │                         tables, enums, RLS policies, guard triggers, the
│   │                         occurrence generator, the signup lifecycle machine,
│   │                         discovery RPCs, moderation, retention queues, grants.
│   ├── tests/                pgTAP suite, 10 files. Tests the migrations directly.
│   ├── functions/push-sender/  The only server code this repo owns (Deno, 69 lines).
│   ├── seed.sql              20 Pacific Northwest mics, 4 demo accounts.
│   └── config.toml           Local Supabase stack config.
├── scripts/db/               verify-local.sh + shim-supabase.sql: run migrations and
│                             pgTAP on a bare Postgres when Docker is unavailable.
├── e2e/                      Two Maestro YAML flows. Not wired to any runner.
├── docs/                     STEP0_PROPOSAL.md (approved plan), compliance, store,
│                             privacy declarations.
└── assets/                   Icons, glyphs, tab icons.
```

---

## 3. Render and simulation separation

**Nothing in this repository imports THREE or touches a renderer.**

```
$ grep -rn "three\|THREE\|WebGL\|webgl\|gl-matrix\|canvas" --include=*.ts --include=*.tsx --include=*.json src/ package.json
src/stores/filters.test.ts:65:  it('recognizes the three quick picks', () => {
src/components/logo.tsx:8: * teardrop, with three radiating arcs in the discipline accents. Vector
```

Both hits are the English word. There is no WebGL context anywhere, no `expo-gl`,
no `react-three-fiber`. The map is `react-native-maps` (`src/features/discovery/components/mic-map.tsx:3`),
which renders a native platform map view, not a GL scene this code drives.

### The equivalent question, answered

The meaningful version of "can state advance without a renderer" here is: **is the
domain logic separable from React and from the native module graph?** Partly yes,
and the split is unusually clean where it exists.

**Modules with zero React, zero native, zero network. These run in plain Node today:**

| File                                     | Exports                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| `src/features/auth/validation.ts`        | 6 validators, clock injected at `:39`                    |
| `src/features/discovery/order.ts`        | `sortSoonestNearest`                                     |
| `src/features/discovery/distance.ts`     | `formatMilesFromMeters`, `radiusLabel`, `RADIUS_CHOICES` |
| `src/features/discovery/recurrence.ts`   | `describeRecurrence`, `formatLocalTime`                  |
| `src/features/discovery/freshness.ts`    | `freshness(lastConfirmedAt, now)`                        |
| `src/features/producer/rrule-builder.ts` | `buildRrule`, `parseRrule`, `computeAnchorDate`          |
| `src/features/profile/home-area.ts`      | 4 helpers                                                |
| `src/features/profile/social.ts`         | 5 helpers                                                |
| `src/features/pro/status.ts`             | `resolveProStatus(configured, devBuild, rcEntitled)`     |
| `src/features/signups/window.ts`         | `parseIntervalMs`, `signupWindow(..., now)`              |
| `src/theme/tokens.ts`                    | tokens only                                              |

`src/features/discovery/freshness.ts:1` imports `@/theme`, which is itself pure data,
so it stays in this list.

`src/stores/filters.ts` is a hybrid. The store itself is a zustand hook (`:59`), but
`isoWeekday` (`:84`), `dayQuickPick` (`:95`), `sheetFilterCount` (`:117`),
`filtersToRpcArgs` (`:135`), and `hasActiveFilters` (`:154`) are pure and are tested
directly (`src/stores/filters.test.ts`).

`src/features/calendar/calendar.ts` is split within one file: `googleCalendarUrl` (`:28`)
is pure and tested; `addToCalendar` (`:39`) imports `expo-calendar` and `react-native`
at `:1-2`, so importing the module at all pulls in native modules.

**Modules fused to the platform:** everything under `src/app/`, everything under
`src/components/`, every `features/*/components/`, every `features/*/queries.ts`
(each imports `@/lib/supabase` and `@tanstack/react-query`), `src/features/auth/session.tsx`,
`src/features/auth/api.ts`, `src/features/discovery/location.ts`,
`src/features/profile/geocode.ts`, `src/features/profile/avatar.ts`,
`src/features/producer/poster.ts`, `src/features/pro/use-pro.ts`, and all of `src/lib/`.

### Where things are genuinely fused

The entanglement in this codebase is not render/simulation. It is **logic/transport**
and **logic/database**:

1. **Server state machines live only in SQL and cannot be exercised from JavaScript
   at all.** The signup lifecycle (`supabase/migrations/20260728000900_signups.sql:11-57`),
   the occurrence generator (`supabase/migrations/20260728000400_occurrences_signups.sql:61-202`),
   the reconciliation on series edit (`supabase/migrations/20260728000800_producer.sql:38-91`),
   and the confirmation stamp guard (`.../20260728000800_producer.sql:9-26`) are all
   PL/pgSQL. Testing them requires a live Postgres with PostGIS and pgTAP. There is no
   JS-side model of any of these rules to test against, and no shared fixture format
   between the two suites.

2. **Every mutation hook is fused to the module-singleton client.** Each
   `features/*/queries.ts` calls `getSupabase()` inline inside `mutationFn`
   (for example `src/features/signups/queries.ts:33`, `src/features/producer/queries.ts:63`,
   `src/features/safety/queries.ts:19`). There is no repository interface and no
   injection point. Substituting a fake requires `jest.mock('@/lib/supabase')`,
   which is a module-graph hack, not a seam.

3. **The root layout runs side effects on import.** `src/app/_layout.tsx:120` constructs
   the AsyncStorage persister and `:122` calls `initSentry()` at module scope, before
   any component mounts. Importing that file in a test executes both.

**Estimate to separate, if that is wanted (opinion, and I did not do it):**
the JS side is already 80 percent separated; the remaining work is introducing a
`SupabaseClient` parameter or a small repository interface at the `features/*/queries.ts`
boundary. That is roughly 11 files and a mechanical change, maybe half a day. The SQL
side is not separable at any reasonable cost; the correct move there is to keep testing
it as SQL via pgTAP and to make that suite runnable in CI, not to port the rules to JS.

---

## 4. The wire protocol

**There is no bespoke wire protocol.** No message type union, no handler switch, no
serialization layer written in this repo. `grep` for a message discriminant finds
nothing because nothing of the kind exists.

What exists is five distinct transports, all provided by `@supabase/supabase-js` or
by platform SDKs. Below is every one, with what is actually sent.

### 4a. PostgREST RPC over HTTPS

Eight RPC call sites. Argument shapes are generated into
`src/types/database.types.ts` and enforced only at compile time.

| RPC                | Caller                                 | Args                                                                   | Mutates                                                                              | Validated on receipt?                                                                                     |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `mics_near`        | `src/features/discovery/queries.ts:14` | 9 params built by `filtersToRpcArgs` (`src/stores/filters.ts:135-151`) | Nothing, read only                                                                   | **No.** Return is cast to `NearbyMic[]` and returned raw (`:21`)                                          |
| `search_mics`      | `src/features/discovery/queries.ts:32` | `{ p_query: string }`                                                  | Nothing                                                                              | **No**                                                                                                    |
| `draw_lottery`     | `src/features/signups/queries.ts:119`  | `{ p_occurrence_id: uuid }`                                            | `signups.status`, `signups.slot_position` for the whole occurrence                   | **No** on the client. Server checks ownership (`supabase/migrations/20260728000900_signups.sql:98-100`)   |
| `set_slot_order`   | `src/features/signups/queries.ts:141`  | `{ p_occurrence_id: uuid, p_signup_ids: uuid[] }`                      | `signups.slot_position`                                                              | **No** on the client. Server checks ownership (`.../20260728000900_signups.sql:137-139`)                  |
| `mark_on_deck`     | `src/features/signups/queries.ts:158`  | `{ p_signup_id: uuid, p_on_deck: boolean }`                            | `signups.on_deck_at`, inserts `notification_outbox`                                  | **No** on client. Server checks ownership and status (`.../20260728001500_on_deck_and_posters.sql:46-51`) |
| `delete_account`   | `src/features/safety/queries.ts:86`    | none                                                                   | Deletes 7 tables' rows, anonymizes `profiles`, deletes `auth.users`                  | **No**. Server derives identity from `auth.uid()` (`.../20260728001400_home_area.sql:128`)                |
| `moderate_content` | `src/features/safety/queries.ts:143`   | `{ p_target, p_target_id, p_approve }`                                 | `moderation_status` on profiles/venues/mic_series                                    | **No** on client. Server checks admin (`.../20260728001000_moderation.sql:125-127`)                       |
| `review_claim`     | `src/features/producer/queries.ts:240` | `{ p_claim_id: uuid, p_approve: boolean }`                             | `claim_requests`, `producer_profiles`, `profiles.is_producer`, `mic_series.owner_id` | **No** on client. Server checks admin (`.../20260728000800_producer.sql:125-127`)                         |

The RPC argument type, quoted from the generated contract that both sides rely on
(`src/stores/filters.ts:132-151`):

```ts
export type MicsNearArgs = Database['public']['Functions']['mics_near']['Args'];

/** Translates UI filter state into mics_near RPC arguments. */
export function filtersToRpcArgs(
  filters: DiscoveryFilters,
  center: { lat: number; lng: number },
): MicsNearArgs {
  const window = filters.timeOfDay ? TIME_WINDOWS[filters.timeOfDay] : null;
  return {
    p_lat: center.lat,
    p_lng: center.lng,
    p_radius_m: Math.round(filters.radiusKm * 1000),
    p_disciplines: filters.disciplines.length > 0 ? filters.disciplines : undefined,
    p_days: filters.days.length > 0 ? filters.days : undefined,
    p_free_only: filters.freeOnly,
    p_methods: filters.methods.length > 0 ? filters.methods : undefined,
    p_start_hour: window?.startHour,
    p_end_hour: window?.endHour,
  };
}
```

### 4b. PostgREST table CRUD over HTTPS

Direct table reads and writes, bypassing any RPC layer. These are the ones that mutate
state without a server-side function guarding the call:

| Operation  | Site                                       | Table                                                                       | Server guard                                     |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------ |
| insert     | `src/features/auth/api.ts:107,128,137,144` | `profiles`, `performer_profiles`, `producer_profiles`, `notification_prefs` | RLS owner check + `guard_profile_writes` trigger |
| update     | `src/features/producer/queries.ts:49`      | `mic_series.last_confirmed_at`                                              | `guard_series_confirm` overwrites the sent value |
| update     | `src/features/producer/queries.ts:63`      | `mic_series` arbitrary patch                                                | RLS `series owner update`                        |
| update     | `src/features/producer/queries.ts:86`      | `mic_occurrences` arbitrary patch                                           | RLS `occurrences owner update`                   |
| insert     | `src/features/producer/queries.ts:118,132` | `venues`, `mic_series`                                                      | RLS insert `with check` on `created_by`          |
| insert     | `src/features/producer/queries.ts:201`     | `claim_requests`                                                            | RLS `claims requester insert`                    |
| update     | `src/features/producer/queries.ts:259,266` | `profiles.is_producer`, `producer_profiles`                                 | RLS owner                                        |
| insert     | `src/features/signups/queries.ts:35`       | `signups`                                                                   | RLS + `signup_lifecycle` trigger                 |
| delete     | `src/features/signups/queries.ts:56`       | `signups`                                                                   | RLS `signups performer withdraw`                 |
| **update** | `src/features/signups/queries.ts:174`      | **`signups.status`, arbitrary**                                             | RLS `signups producer update` only               |
| insert     | `src/features/discovery/queries.ts:82`     | `listing_flags`                                                             | RLS                                              |
| insert     | `src/features/safety/queries.ts:19,39`     | `reports`, `blocks`                                                         | RLS                                              |
| update     | `src/features/safety/queries.ts:162,182`   | `reports`, `listing_flags`                                                  | RLS admin                                        |
| update     | `src/features/profile/queries.ts:27`       | `profiles` arbitrary patch                                                  | RLS owner + guard trigger                        |
| upsert     | `src/features/notifications/queries.ts:13` | `notification_prefs`                                                        | RLS owner                                        |
| upsert     | `src/lib/notifications.ts:33`              | `device_push_tokens`                                                        | RLS owner                                        |

### 4c. Supabase Realtime (WebSocket)

Exactly one subscription in the entire app. Quoted in full
(`src/features/signups/queries.ts:87-110`):

```ts
useEffect(() => {
  if (!occurrenceId) {
    return;
  }
  const channel = getSupabase()
    .channel(`signups-${occurrenceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'signups',
        filter: `occurrence_id=eq.${occurrenceId}`,
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ['signup', 'roster', occurrenceId] });
        queryClient.invalidateQueries({ queryKey: ['signup', 'mine', occurrenceId] });
      },
    )
    .subscribe();
  return () => {
    getSupabase().removeChannel(channel);
  };
}, [occurrenceId, queryClient]);
```

The payload is **discarded entirely**. The handler takes no argument and ignores the
change record; it only invalidates. This is the closest thing to a "handler switch" in
the codebase, and it has one branch. The publication is declared at
`supabase/migrations/20260728000900_signups.sql:229`.

Consequence for testing: there is no message shape to assert on, and no way for a
malformed realtime frame to corrupt client state, because no realtime frame is ever read.

### 4d. Notification outbox to Expo Push (server to server)

The one real message shape this repo constructs, in
`supabase/functions/push-sender/index.ts:40-48`:

```ts
const messages = pending.flatMap((n) =>
  (tokensByProfile.get(n.profile_id) ?? []).map((to) => ({
    to,
    title: n.title,
    body: n.body,
    data: n.payload,
    sound: 'default',
  })),
);
```

Rows come from `notification_outbox` (`supabase/migrations/20260728000900_signups.sql:173-183`),
enqueued by four producers: `queue_signup_notification` (`.../000900:187-226`),
`queue_favorite_reminders` (`.../20260728001500:78-114`), `queue_new_mic_alerts`
(`.../20260728001100:41-77`), `queue_weekly_digest` (`.../20260728001100:79-115`), and
`mark_on_deck` (`.../20260728001500:60-71`). `payload` is `jsonb` with no schema
constraint beyond `not null default '{}'`.

**Validation on receipt: none.** The function does not check the Expo API response
(`index.ts:51-56` awaits `fetch` and discards the result), and marks every row sent
regardless (`index.ts:60-66`). A rejected batch is silently lost.

Authorization is a string suffix comparison (`index.ts:10-14`):

```ts
const authHeader = req.headers.get('Authorization') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
if (!authHeader.endsWith(serviceKey)) {
  return new Response('forbidden', { status: 403 });
}
```

This is not a constant-time comparison and it accepts any header that merely ends with
the key. Opinion: functionally adequate given the key is a bearer secret, but it is the
kind of check a security-focused test should pin.

### 4e. Auth, Storage, and device APIs

- GoTrue: `signInWithPassword`, `signUp`, `signOut`, `signInWithIdToken`,
  `signInWithOAuth`, `exchangeCodeForSession` (`src/features/auth/api.ts:18,25,32,49,62,77`).
- Storage: `avatars` and `posters` buckets, upload plus `getPublicUrl`
  (`src/features/profile/avatar.ts:40-46`, `src/features/producer/poster.ts:40-46`).
- Expo Push token registration (`src/lib/notifications.ts:31`).

### Bottom line on validation

**There is no runtime payload validation anywhere in this codebase, in either
direction.** No zod, no io-ts, no yup, no hand-rolled guards on server responses.
`grep` the dependency list: none are present. The only validation is:

- **Compile-time**, via `src/types/database.types.ts`, which is regenerated from the
  schema by `npm run db:types` and can silently drift if that is not re-run.
- **Server-side**, via CHECK constraints, enum types, RLS `WITH CHECK`, and guard
  triggers. That layer is genuinely thorough.

A server returning a wrong-shaped row will flow straight into render.

---

## 5. Authority model

**The server is authoritative, and it is enforced at the database, not in the
application.** This is one of the codebase's real strengths.

### Where authority is decided

Three mechanisms, in order of how much they carry:

**1. RLS policies.** Every table in `public` has RLS enabled, asserted by the pgTAP
suite (`supabase/tests/rls.test.sql:11-19`). Writes are default-deny; each policy
names exactly who may do what. Examples:

- A performer may insert only their own signup, only into a scheduled occurrence,
  only when the window is open, only if not blocked by the producer, only if they hold
  the performer role (`supabase/migrations/20260728000900_signups.sql:63-81`).
- Only the series owner (or admin) may update signups
  (`.../20260728000400_occurrences_signups.sql:289-291`).
- `mic_occurrences` has **no insert policy at all** for API roles. The comment says so
  explicitly (`.../20260728000400_occurrences_signups.sql:48-49`): "Inserts happen only
  through the generator (definer) or service role."

**2. Guard triggers that overwrite whatever the client sent.** These are the
"cannot assert your own facts" layer:

- `guard_profile_writes` (`.../20260728001000_moderation.sql:43-78`) forces `is_admin := false`
  on insert, restores `old.is_admin` on update, restores `old.moderation_status` if the
  client tried to change it, and stamps `eula_accepted_at` server-side.
- `guard_producer_writes` (`.../20260728000200_profiles.sql:143-159`) forces `verified := false`.
- `guard_moderated_writes` (`.../20260728001000_moderation.sql:81-106`) forces
  `moderation_status` through the banned-terms filter.
- `guard_series_confirm` (`.../20260728000800_producer.sql:9-24`) overwrites
  `last_confirmed_at := now()` and `last_confirmed_by := auth.uid()`, making freshness
  unforgeable. The client sends a timestamp (`src/features/producer/queries.ts:49`) and
  the server ignores it. The comment at `src/features/producer/queries.ts:42` says exactly this.
- `signup_lifecycle` (`.../20260728000900_signups.sql:11-55`) sets the initial status
  itself: `new.status := 'requested'; new.slot_position := null;` at `:30-31`, then
  computes the real value from capacity. The client cannot choose its own starting state.
  The migration comment at `:59-61` explains that the insert policy used to assert this
  and was moved into the trigger precisely because a client could bypass the policy path.

**3. SECURITY DEFINER RPCs with explicit authorization checks.** `draw_lottery`
(`:98-100`), `set_slot_order` (`:137-139`), `mark_on_deck` (`:46-48`), `review_claim`
(`.../20260728000800_producer.sql:125-127`), `moderate_content`
(`.../20260728001000_moderation.sql:125-127`), and `delete_account`
(`.../20260728001400_home_area.sql:130-132`) each raise `42501` when the caller
is not authorized.

### What happens today when a client lies

**Claiming to move an object it does not own.** Example: a performer calls
`useSetSignupStatus` (`src/features/signups/queries.ts:174`) on someone else's signup,
or on their own, trying to mark themselves `performed`. The only UPDATE policy on
`signups` is `"signups producer update"` (`.../20260728000400_occurrences_signups.sql:289-291`)
with `using (private.owns_occurrence_series(occurrence_id) or private.is_admin())`.
The performer is neither, so **RLS filters the row out of the UPDATE. Zero rows are
affected. Postgres returns success. No error is raised.**

The client code checks only `if (error)` (`src/features/signups/queries.ts:175`), so
`onSuccess` fires, queries are invalidated, and the UI reports the action worked. The
refetch then shows the old value. This same pattern applies to `useConfirmSeries`,
`useUpdateSeries`, `useUpdateOccurrence`, `useUpdateProfile`, `useResolveReport`,
and `useResolveFlag`: **no mutation in this codebase checks affected row count.**

The pgTAP suite already knows about this behavior and tests for it explicitly
(`supabase/tests/rls.test.sql:57-64`):

```sql
-- RLS filters rows from UPDATE silently: the write must affect nothing.
update mic_series set title = 'hacked'
where id = '20000000-0000-4000-c000-000000000001';
select is(
  (select title from mic_series where id = '20000000-0000-4000-c000-000000000001'),
  'Rusty Fret Open Mic',
  'anon update of a series affects zero rows'
);
```

So the data is safe. The **UI lies**, and no JavaScript test can currently tell the
difference between a write that landed and a write that was silently dropped, because
both produce the identical `{ error: null }`.

**Claiming a score it did not earn.** The nearest analogue is a performer trying to
grant themselves a confirmed slot or a lottery win. Blocked in three independent
places: `signup_lifecycle` pins the initial status; no UPDATE policy exists for
performers; and `draw_lottery` runs `random()` server-side
(`.../20260728000900_signups.sql:107`), so the client's on-screen shuffle
(`src/app/producer/night/[occurrenceId].tsx:109`) is purely cosmetic and has no bearing
on the result. Similarly, the freshness badge cannot be backdated (`guard_series_confirm`),
and `is_admin` cannot be self-granted (`guard_profile_writes`).

**Where authority is weaker (opinion):**

- `set_slot_order` and `useSetSignupStatus` let an authorized producer set _any_
  `slot_position` or _any_ `signup_status`, including transitions that make no sense
  (`waitlisted` straight to `performed`). `signup_lifecycle` on UPDATE
  (`.../20260728000900_signups.sql:22-27`) pins only `occurrence_id`, `performer_id`,
  and `created_at`. There is no legal-transition table. That is a deliberate
  "the producer runs their room" choice, but it means status is unvalidated for the
  authorized path.
- `supabase/migrations/20260728001200_grants.sql:12-14` issues
  `grant all on all tables in schema public to anon, authenticated, service_role`,
  and lines 23-28 extend that to all future objects via `alter default privileges`.
  The migration's own comment (lines 3-8) explains this was needed to fix a 403 and
  argues security lives in RLS, which is true today. But it converts "forgot to add RLS
  to a new table" from a non-event into a world-writable table. The rls.test.sql
  assertion at `:11-19` is the only thing standing between that mistake and production,
  and it currently runs in no CI.

---

## 6. Tick and timing

**There is no tick loop. There is no fixed timestep, no variable timestep, and no
frame-coupled simulation.** No `requestAnimationFrame` appears anywhere in `src/`
(confirmed by grep across `useEffect|addEventListener|setInterval|setTimeout|requestAnimationFrame`,
which returned 17 lines, none of them rAF).

State advances in four independent places, none of them a loop this repo drives:

**1. Scheduled server jobs (pg_cron).** Four schedules, all in UTC:

| Job                            | Schedule       | Function                                                                          |
| ------------------------------ | -------------- | --------------------------------------------------------------------------------- |
| `generate-occurrences-nightly` | `17 9 * * *`   | `private.generate_occurrences()` (`.../20260728000800_producer.sql:162-166`)      |
| `favorite-reminders`           | `0 * * * *`    | `private.queue_favorite_reminders()` (`.../20260728001100_retention.sql:120-121`) |
| `new-mic-alerts`               | `30 */4 * * *` | `private.queue_new_mic_alerts()` (`.../20260728001100_retention.sql:122-123`)     |
| `weekly-digest`                | `0 17 * * 1`   | `private.queue_weekly_digest()` (`.../20260728001100_retention.sql:124-125`)      |

Both scheduling blocks are wrapped in `exception when others then raise notice`
(`.../20260728000800_producer.sql:167-168`, `.../20260728001100_retention.sql:126-127`).
**If pg_cron is unavailable, the migration succeeds and every scheduled job silently
never runs.** See section 12.

**2. Database triggers, on write.** `mic_series_generate` fires after insert or after
update of `rrule, anchor_date, start_time, doors_offset, timezone, is_active, deleted_at`
(`.../20260728000800_producer.sql:107-110`). `signups_lifecycle` fires before insert or
update (`.../20260728000900_signups.sql:56-57`). `signups_notify` fires after update
(`.../20260728000900_signups.sql:225-226`). Six `set_updated_at` triggers.

**3. Client refetch policy.** `staleTime: 60_000`, `gcTime: 24h`, `retry: 2`
(`src/lib/query-client.ts:11-14`). Plus event-driven invalidation from every
`onSuccess` handler and from the single Realtime subscription.

**4. One genuine interval, and it is cosmetic.** `src/app/producer/night/[occurrenceId].tsx:108-110`:

```ts
shuffleTimer.current = setInterval(() => {
  setShuffling((cur) => (cur ? [...cur].sort(() => Math.random() - 0.5) : cur));
}, 120);
```

120 ms, frame-independent, purely visual during the lottery draw. It never touches
server state.

### Sources of nondeterminism, each cited

**`Math.random()`**

- `src/app/producer/night/[occurrenceId].tsx:109`. Also note this comparator is a
  biased shuffle (a random comparator is not a uniform permutation), which is harmless
  since it is decoration, but a test asserting "the shuffle is fair" would be wrong to write.

**SQL `random()`**

- `supabase/migrations/20260728000900_signups.sql:107`, inside
  `row_number() over (order by random())`. This is the real draw. It is unseeded and
  unseedable, so `draw_lottery` cannot be tested for a specific outcome, only for
  invariants (correct counts, capacity respected, positions 1..n contiguous).

**`Date.now()`**

- `src/features/profile/avatar.ts:46` (cache-busting query param)
- `src/features/producer/poster.ts:47` (same)

**`new Date()` with no injected clock**

- `src/app/mic/[id].tsx:95` (`freshness(series.last_confirmed_at, new Date())`)
- `src/features/discovery/queries.ts:52` (`.gte('starts_at', new Date().toISOString())`)
- `src/features/producer/queries.ts:49` (confirm timestamp, subsequently overwritten by the server)
- `src/features/producer/queries.ts:178` (occurrence window)
- `src/features/safety/queries.ts:165,185` (`resolved_at`)
- `supabase/functions/push-sender/index.ts:62` (`sent_at`)

**SQL `now()`** appears throughout the migrations: the generator's horizon start
(`.../20260728000400_occurrences_signups.sql:154-157`), the signup window policy
(`.../20260728000900_signups.sql:78-79`), the discovery RPCs' "next occurrence" lateral
(`.../20260728000700_discovery.sql:83`, `:153`), and all retention queries. Inside a
pgTAP transaction `now()` is fixed to transaction start, so this is deterministic there.

**Timezone-dependent local-day arithmetic. This is the one that matters.**
`src/features/discovery/order.ts:13-16`:

```ts
function dayStamp(iso: string): number {
  const d = new Date(iso);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
```

`getFullYear`/`getMonth`/`getDate` read the **host** timezone, not the mic's. This is
arguably right for a user-facing "tonight beats tomorrow" (the comment at `:1-6` says
that is the intent), but it makes the function's output a property of the machine.
Demonstrated:

```
$ for tz in UTC America/Los_Angeles Pacific/Kiritimati; do TZ=$tz node -e "..."; done
TZ=UTC dayStamp('2026-07-28T03:00:00Z') = 20260728
TZ=America/Los_Angeles dayStamp('2026-07-28T03:00:00Z') = 20260727
TZ=Pacific/Kiritimati dayStamp('2026-07-28T03:00:00Z') = 20260728
```

Jest pins no `TZ` (`grep -rn "TZ\|timezone" package.json` returns nothing), so the
existing `order.test.ts` assertions are silently coupled to the runner's clock. They
happen to pass in every zone I checked because their fixtures use midday UTC times,
but any new test near a day boundary will be flaky across developer machines and CI.
`src/stores/filters.test.ts:58-59` has the same coupling via `new Date(2026, 6, 26)`.

**Floating point accumulation.** Minor and bounded: `formatMilesFromMeters`
(`src/features/discovery/distance.ts:5`) divides by `1609.344`; `radiusLabel`
(`:26`) divides by `1.609344`; `regionToZoom` (`src/features/discovery/components/mic-map.tsx:25`)
uses `Math.log2` then `Math.round`, so zoom is quantized and stable; PostGIS
`st_distance` on geography returns a double that flows into `distance_m`. None of these
accumulate across frames because there are no frames.

**Animation frame timing.** Not applicable. Reanimated 4.5 is a dependency
(`package.json:40`) but `grep` finds no import of it in `src/`.

---

## 7. Seams

### Places a test can substitute a fake cleanly

**Injected-dependency functions. These are the good ones, and there are more than I
expected:**

| Seam                                                                   | Site                                        | What it lets you fake                                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveProStatus(configured, devBuild, rcEntitled)`                   | `src/features/pro/status.ts:19`             | The entire entitlement decision, with zero RevenueCat involvement. The one deliberate purity boundary in the repo, and it is documented as such at `:12-18` |
| `freshness(lastConfirmedAt, now)`                                      | `src/features/discovery/freshness.ts:17`    | The clock                                                                                                                                                   |
| `signupWindow(startsAt, opens, closes, now)`                           | `src/features/signups/window.ts:23`         | The clock                                                                                                                                                   |
| `validateBirthYear(value, now)`                                        | `src/features/auth/validation.ts:39`        | The clock                                                                                                                                                   |
| `computeAnchorDate(choice, today, biweeklyStartsNextWeek)`             | `src/features/producer/rrule-builder.ts:96` | The clock and the biweekly parity choice                                                                                                                    |
| `dayQuickPick(days, todayIso)` / `sheetFilterCount(filters, todayIso)` | `src/stores/filters.ts:95,117`              | Today's weekday                                                                                                                                             |
| `filtersToRpcArgs(filters, center)`                                    | `src/stores/filters.ts:135`                 | Both inputs; nothing implicit                                                                                                                               |

**Module boundaries reachable by `jest.mock`:** `getSupabase` is a single named export
from one module (`src/lib/supabase.ts:14`), and all 19 call sites import it by name.
`jest.mock('@/lib/supabase')` therefore intercepts the entire network boundary in one
statement. Not injection, but a real and reliable seam.

**Platform-resolver seam.** `mic-map.tsx` / `mic-map.web.tsx` and
`pin-picker.tsx` / `pin-picker.web.tsx` are resolved by Metro's platform extensions.
A jsdom-flavored test naturally gets the `.web` variant, which is pure React Native
primitives with no native module (`src/features/discovery/components/mic-map.web.tsx:1-4`
imports only `react-native` and local modules). This is the only way the map path is
testable at all today.

**Context provider.** `SessionProvider` / `useSession`
(`src/features/auth/session.tsx:14,37`) is a standard React context, so a test can wrap
a component tree in a fake provider without touching Supabase. Note the default context
value is `{ session: null, ready: false }` (`:12`), which means an unwrapped component
renders as "still loading" rather than crashing.

**TanStack Query.** Any hook can be exercised under a test-local `QueryClientProvider`
with `retry: false`, independent of the app singleton.

**The pgTAP suite is its own seam.** SQL logic is tested directly against the schema
with `set local role` plus `request.jwt.claims` impersonation
(`supabase/tests/rls.test.sql:24-25,70-72`), inside a rolled-back transaction (`:3`).
This is a genuinely good boundary and needs no fakes at all.

**Pure modules needing no seam whatsoever:** the 11 files listed in section 3.

### Places a dependency is hard-wired and hostile

| Problem                                                 | Site                                                                                                                            | Why it hurts                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queryClient` is a module-scope singleton               | `src/lib/query-client.ts:9`                                                                                                     | Shared across every test in a file. No factory, so cache from one test leaks into the next                                                                            |
| `persister` built at module scope                       | `src/app/_layout.tsx:120`                                                                                                       | Importing the root layout touches AsyncStorage                                                                                                                        |
| `initSentry()` called at module scope                   | `src/app/_layout.tsx:122`                                                                                                       | Importing the root layout runs Sentry setup. Not inside a component, not inside an effect                                                                             |
| `getSupabase()` memoizes forever                        | `src/lib/supabase.ts:12,15`                                                                                                     | `client ??=` means the first call wins for the process lifetime. A test that lets a real client be constructed poisons the module for every later test in that worker |
| `configured` is module-level mutable state, never reset | `src/features/pro/use-pro.ts:14,16-26`                                                                                          | `ensureConfigured` flips it to `true` once and there is no way back. Any test that reaches it changes behavior for subsequent tests                                   |
| `apiKey` resolved at import time via `Platform.select`  | `src/features/pro/use-pro.ts:9-12`                                                                                              | Cannot be varied per test without module reset                                                                                                                        |
| `__DEV__` global read directly                          | `src/features/pro/use-pro.ts:42,51`                                                                                             | The pure function underneath is fine; the hook is not                                                                                                                 |
| zustand store is a module singleton                     | `src/stores/filters.ts:59`                                                                                                      | `disciplinesSeeded` is sticky (`:66-71`) and `reset()` (`:80`) does not clear it, so seeding state survives across tests                                              |
| `Date.now()` / `new Date()` called inline               | `avatar.ts:46`, `poster.ts:47`, `producer/queries.ts:49,178`, `safety/queries.ts:165,185`, `mic/[id].tsx:95`                    | No clock parameter, so these paths cannot be pinned                                                                                                                   |
| `Math.random()` inline                                  | `src/app/producer/night/[occurrenceId].tsx:109`                                                                                 | Not injectable                                                                                                                                                        |
| Native modules imported at module top                   | `location.ts:1`, `geocode.ts:1`, `avatar.ts:2`, `poster.ts:2`, `calendar.ts:1`                                                  | Importing the module pulls the native dependency even to reach a pure export in the same file. `googleCalendarUrl` is pure but lives beside `expo-calendar`           |
| `DEFAULT_CENTER` hard-coded                             | `src/features/discovery/location.ts:31`                                                                                         | Seattle coordinates baked in                                                                                                                                          |
| Edge Function has no exported handler                   | `supabase/functions/push-sender/index.ts:9`                                                                                     | `Deno.serve(async (req) => {...})` at module scope. Nothing is exported. Cannot be unit tested without a Deno runtime and an HTTP request                             |
| Bare `fetch` for image bodies                           | `avatar.ts:33`, `poster.ts:34`                                                                                                  | Global, unmocked, outside the `getSupabase` boundary                                                                                                                  |
| Screens hold their own logic                            | `src/app/mic/[id].tsx` (670 lines), `src/app/producer/[id].tsx` (484), `src/features/producer/components/series-form.tsx` (595) | Any assertion about their behavior requires full component rendering with providers                                                                                   |

**The single most important structural fact for a testing strategy:** the
`features/*/queries.ts` layer, which contains every write in the application, has
**no seam of its own**. It is 11 files, each calling `getSupabase()` inline inside a
`mutationFn`. Testing it means mocking a module and asserting on the shape of chained
builder calls (`.from().update().eq()`), which tests the call syntax rather than the
behavior. See section 12.

---

## 8. State ownership and persistence

### Authoritative in memory (server side)

Nothing. There is no stateful server process this repository owns. The Edge Function
is stateless per request (`supabase/functions/push-sender/index.ts:9`). All authority
lives in Postgres tables.

### Authoritative, persisted (Postgres)

16 tables across the migrations: `eula_versions`, `profiles`, `performer_profiles`,
`producer_profiles`, `venues`, `mic_series`, `claim_requests`, `blocks`, `reports`,
`listing_flags`, `mic_occurrences`, `signups`, `favorites`, `attendance_log`,
`device_push_tokens`, `notification_prefs`, `notification_outbox`, `banned_terms`.
Plus four views (`public_profiles`, `performer_public`, `producer_public`,
`signup_roster`) and two Storage buckets (`avatars`, `posters`).

Format: relational, with PostGIS `geography(point, 4326)` for venue and home locations
(`.../20260728000300_venues_series.sql:11`, `.../20260728000200_profiles.sql:22`), and
`timestamptz` plus an IANA `timezone` string on the series
(`.../20260728000300_venues_series.sql:88`), validated against `pg_timezone_names`
(`.../20260728000300_venues_series.sql:113-126`). Naive local times are never stored;
`starts_at` is always computed as `(local_date + start_time) at time zone timezone`
(`.../20260728000400_occurrences_signups.sql:165`).

### Client memory, not persisted

- `useFiltersStore` (`src/stores/filters.ts:59`): discipline, day, radius, cost,
  method, time-of-day filters, plus `view` and `disciplinesSeeded`. Lost on app restart.
- `useOnboardingStore` (`src/stores/onboarding.ts:13`): the accepted EULA version,
  carried between the EULA and onboarding screens. The comment at `:4-5` says it is
  discarded once onboarding completes.
- Per-screen `useState`: search text, modal open flags, `manualCenter`, the lottery
  shuffle array.

### Client persisted (AsyncStorage)

- **The whole TanStack Query cache**, via `createAsyncStoragePersister`
  (`src/app/_layout.tsx:120`) wired through `PersistQueryClientProvider` with
  `maxAge: 24 * 60 * 60 * 1000` (`:130`). This includes the user's own profile row
  (which carries `home_lat`, `home_lng`, `birth_year`), nearby mic lists, rosters,
  and favorites. The stated reason is offline readability in bar parking lots
  (`:118-119`).
- **The auth session**, via `storage: AsyncStorage` on the Supabase client
  (`src/lib/supabase.ts:17`) with `persistSession: true` and `flowType: 'pkce'` (`:19,21`).

### The requested scenario, translated

There is no "room" and no "furniture layout." The nearest structural equivalents are
**a mic series' recurrence definition plus its generated occurrence window** and
**a night's running order (slot positions)**. Both are ordinary table rows.

**Across a server restart:** both survive intact. They are committed rows in
`mic_series`, `mic_occurrences`, and `signups`. Nothing is held in process memory.

There is one real caveat. The rolling occurrence window is not self-healing on restart;
it is topped up by a pg_cron job (`.../20260728000800_producer.sql:162-166`). If that
schedule was never created (see section 6, the exception swallow at `:167-168`), the
window that exists at restart is the window that exists forever, and it decays by one
day per day until the app shows nothing upcoming.

**Across a client reconnect:** the query cache rehydrates from AsyncStorage if within
24 hours, so the last-seen listing data renders immediately, then refetches. Filter
state does **not** survive: `useFiltersStore` resets to `DEFAULT_FILTERS`
(`src/stores/filters.ts:29-36,60`), so radius, day, and method selections are lost
while the stale results for the _previous_ filters may still be shown from cache for a
moment. The Realtime channel is torn down on unmount and recreated on remount
(`src/features/signups/queries.ts:107-109`). Any signup status change that happened
while disconnected is picked up by the refetch, not by a replayed event: there is no
event log, and Realtime does not backfill.

**Server-side deletion semantics:** listings soft-delete only. `mic_series` and
`venues` have `deleted_at` and no DELETE policy
(`.../20260728000300_venues_series.sql:65,156`). Occurrences are the exception: they
are hard-deleted by `reconcile_future_occurrences`
(`.../20260728000800_producer.sql:55-63,67-76`), but only future, `scheduled`,
override-free, cancellation-free rows with no signups attached. That guard list is
careful and worth a test.

---

## 9. Resource lifecycle

There are **no GPU resources in this codebase**: no geometries, no materials, no
textures, no shaders, no buffers, and therefore no `.dispose()` calls to look for.
This section covers what actually needs releasing here: subscriptions, timers,
channels, and long-lived clients.

### Every creation site and its matching destruction

| Resource                     | Created                                                            | Destroyed                                                             | Verdict                                                                                                |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Supabase client              | `src/lib/supabase.ts:15` (`client ??=`)                            | **Never**                                                             | By design (singleton), but it holds an open Realtime socket and an auth refresh timer for process life |
| Auth state subscription      | `src/features/auth/session.tsx:25`                                 | `:30` `subscription.subscription.unsubscribe()` in the effect cleanup | **Correct.** Also guards a late `getSession()` resolution with a `mounted` flag (`:19,21,29`)          |
| Realtime channel             | `src/features/signups/queries.ts:91-106`                           | `:107-109` `getSupabase().removeChannel(channel)`                     | **Correct.** Keyed on `occurrenceId`, so switching nights tears down and recreates                     |
| Lottery shuffle interval     | `src/app/producer/night/[occurrenceId].tsx:108`                    | `:113-116` in `onSettled`, and `:40-46` on unmount                    | **Leaks on double-press.** See below                                                                   |
| Supercluster index           | `src/features/discovery/components/mic-map.tsx:42-54` in `useMemo` | Not disposed                                                          | Fine. Plain JS object, no handle to release. Rebuilt whenever `mics` changes (`:55`)                   |
| `QueryClient`                | `src/lib/query-client.ts:9` at module scope                        | Never                                                                 | Intentional                                                                                            |
| AsyncStorage persister       | `src/app/_layout.tsx:120` at module scope                          | Never                                                                 | Intentional                                                                                            |
| Sentry                       | `src/app/_layout.tsx:122`, `src/lib/sentry.ts:13`                  | Never                                                                 | Intentional. No-op without a DSN (`sentry.ts:9-11`)                                                    |
| RevenueCat SDK               | `src/features/pro/use-pro.ts:22` inside `ensureConfigured`         | Never, and `configured` never resets (`:14,24`)                       | Intentional for the app; hostile to tests                                                              |
| Uploaded image `ArrayBuffer` | `avatar.ts:31-35`, `poster.ts:30-36`                               | Garbage collected                                                     | Fine                                                                                                   |

### The one real leak

`src/app/producer/night/[occurrenceId].tsx:102-120`:

```ts
function startDraw() {
  if (!occurrenceId || roster.data == null) {
    return;
  }
  const pool = [...roster.data];
  setShuffling(pool);
  shuffleTimer.current = setInterval(() => { ... }, 120);
  draw.mutate(occurrenceId, {
    onSettled: () => {
      if (shuffleTimer.current) {
        clearInterval(shuffleTimer.current);
        shuffleTimer.current = null;
      }
      setShuffling(null);
    },
  });
}
```

`shuffleTimer.current` is assigned unconditionally at `:108`. If `startDraw` runs twice
before the first mutation settles, the second `setInterval` overwrites the ref and the
first interval handle is lost. It keeps calling `setShuffling` every 120 ms until the
component unmounts, and the unmount cleanup at `:42-44` can only clear whichever handle
is current. The Draw button has no `disabled` guard on `draw.isPending`.
Small blast radius, but it is a genuine unmatched-creation site.

### Listeners added without a matching removal

**None.** `grep -rn "addEventListener\|removeEventListener\|addListener"` over `src/`
returns zero hits. The app uses no DOM or React Native event emitters directly. Every
subscription-shaped thing in the codebase (2 of them) has a cleanup.

### Things that are not disposed but arguably should be

Opinion: the persisted query cache has no eviction beyond `maxAge: 24h`
(`src/app/_layout.tsx:130`) and `gcTime: 24h` (`src/lib/query-client.ts:13`). Because
the discovery query key includes the entire filters object including `view`
(see section 12), each distinct filter combination writes a separate entry into
AsyncStorage. There is no size cap. On a device where a user plays with filters, this
grows without bound within the 24-hour window. AsyncStorage on Android has a default
6 MB database limit.

---

## 10. Existing tests

Two suites, unrelated to each other, with no shared fixtures.

### Suite A: Jest, 14 files, 84 assertions

| File                                               | What it asserts                                                                                                                                                              | Would it fail if the named feature broke?                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/auth/validation.test.ts` (50 lines)  | Email regex, 10-char password floor, handle pattern, display-name bounds, age gate at 17 with an injected `NOW`, role requirement                                            | **Yes.** Real branch coverage on all six validators, including the boundary years 2009/2010 (`:40-41`)                                                                                                                                                                                                                                                                                                          |
| `src/features/discovery/recurrence.test.ts` (48)   | Weekly, biweekly, n-weekly, multi-day, monthly ordinals including `-1`, and null-return for unparseable rules                                                                | **Yes.** The best test in the repo. Covers the `return null` fallbacks at `:36-40`                                                                                                                                                                                                                                                                                                                              |
| `src/features/producer/rrule-builder.test.ts` (52) | RRULE construction, day sorting, null on empty input, plus a round-trip through `describeRecurrence` (`:32-39`)                                                              | **Yes.** The round-trip is the strongest assertion here: it pins the producer writer and the discovery reader against each other                                                                                                                                                                                                                                                                                |
| `src/features/signups/window.test.ts` (~46)        | Postgres interval parsing (`7 days`, `02:00:00`, combined), and the three window states with an injected `now`                                                               | **Yes**, for the client mirror. **Note:** it does not verify that the mirror matches the server policy at `.../20260728000900_signups.sql:78-79`. Those two can drift silently                                                                                                                                                                                                                                  |
| `src/features/discovery/freshness.test.ts` (~27)   | Tier boundaries at 0, 14, 15, 45, 46 days; label wording; null handling                                                                                                      | **Yes.** Boundaries are exact                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/features/discovery/order.test.ts` (36)        | Soonest-day-first, distance tiebreak, dateless sinks to bottom, input not mutated (`:32-36`)                                                                                 | **Yes**, but see section 6: the assertions are TZ-coupled and the runner pins no TZ                                                                                                                                                                                                                                                                                                                             |
| `src/features/discovery/distance.test.ts` (24)     | Decimal under 10 mi, rounded at/above, every radius choice labeled, fallback approximation                                                                                   | **Yes**                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/features/profile/social.test.ts` (101)        | Handle extraction from pasted IG/TikTok URLs, `@` stripping, http to https upgrade, `javascript:` left unrewritten (`:57`) and rejected by `urlError` (`:78`), link building | **Yes.** The `javascript:` cases are real security assertions                                                                                                                                                                                                                                                                                                                                                   |
| `src/features/profile/home-area.test.ts` (53)      | City+state accepted, bare ZIP accepted, malformed ZIP rejected, city-without-state rejected, normalization, label fallbacks                                                  | **Yes**                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/features/pro/status.test.ts` (22)             | All six combinations of (configured, devBuild, rcEntitled), including fail-closed in unconfigured production (`:18-21`)                                                      | **Yes.** This is the monetization safety property and it is pinned                                                                                                                                                                                                                                                                                                                                              |
| `src/stores/filters.test.ts` (94)                  | Filter-to-RPC-arg mapping including the km-to-m conversion and the time-window expansion, `hasActiveFilters`, ISO weekday, quick picks, sheet badge count                    | **Yes**                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/features/calendar/calendar.test.ts` (17)      | Google Calendar template URL: UTC stamp format, encoded fields                                                                                                               | **Yes**                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/theme/tokens.test.ts` (37)                    | WCAG AA 4.5:1 for body text, 3:1 for every discipline accent, 44 pt touch target, one accent per discipline                                                                  | **Yes.** Would catch a palette change that breaks contrast. Genuinely useful                                                                                                                                                                                                                                                                                                                                    |
| `src/components/glyph.test.tsx` (23)               | Discipline and signup-method glyph maps are complete; `<Glyph>` renders without crashing                                                                                     | **Partly.** The map completeness checks (`:6-17`) would fail. The render check (`:19-22`) only asserts `root` is truthy, so it would pass with a completely wrong glyph, a wrong size, or a missing accessibility treatment. **This is the one assertion in the suite that cannot meaningfully fail.** Note the test name claims "stays hidden from screen readers" but nothing about accessibility is asserted |

**Coverage shape:** 13 of 14 files test pure functions. There is exactly one component
test, and it is the weak one. **Zero tests exist for:** any hook in
`features/*/queries.ts`, any screen, the auth gate redirect logic
(`src/app/_layout.tsx:60-95`), the Realtime subscription, the map, error and empty
states, or the Edge Function.

### Real output

```
$ npm test

> openmic@1.0.0 test
> jest

PASS src/features/profile/social.test.ts
PASS src/stores/filters.test.ts
PASS src/features/producer/rrule-builder.test.ts
PASS src/features/profile/home-area.test.ts
PASS src/features/discovery/recurrence.test.ts
PASS src/features/auth/validation.test.ts
PASS src/theme/tokens.test.ts
PASS src/features/signups/window.test.ts
PASS src/features/discovery/order.test.ts
PASS src/features/discovery/freshness.test.ts
PASS src/features/pro/status.test.ts
PASS src/features/discovery/distance.test.ts
PASS src/features/calendar/calendar.test.ts
PASS src/components/glyph.test.tsx

Test Suites: 14 passed, 14 total
Tests:       84 passed, 84 total
Snapshots:   0 total
Time:        8.542 s
Ran all test suites.
```

Note: `node_modules` was absent on a fresh clone. `npm ci` was required first
(`added 1157 packages in 42s`).

The other two gates also pass:

```
$ npm run typecheck
> openmic@1.0.0 typecheck
> tsc --noEmit
===TYPECHECK EXIT: 0===

$ npm run lint
> openmic@1.0.0 lint
> expo lint
===LINT EXIT: 0===
```

### Suite B: pgTAP, 10 files, 1112 lines. Could not be run here

`supabase/tests/*.test.sql` covers exactly the logic the Jest suite cannot reach: RLS
enforcement per role (`rls.test.sql`, `plan(26)`), the occurrence generator including a
DST fall-back assertion (`occurrences.test.sql:36-49`) and idempotency
(`:51-59`), signup lifecycle and lottery (`signups.test.sql`), producer claims
(`producer.test.sql`), moderation (`moderation.test.sql`), retention queues
(`retention.test.sql`), discovery RPCs (`discovery.test.sql`), profile links
(`profile-links.test.sql`), home area privacy (`home-area.test.sql`), and on-deck plus
posters (`on-deck-posters.test.sql`). `PROJECT.md:159` claims 128 pgTAP assertions at
the last phase.

I could not execute it. Docker is present but the local Postgres is 16 without PostGIS
or pgTAP:

```
$ bash scripts/db/verify-local.sh
NOTICE:  database "openmic_verify" does not exist, skipping
psql:scripts/db/shim-supabase.sql:96: WARNING:  wal_level is insufficient to publish logical changes
HINT:  Set wal_level to "logical" before creating subscriptions.
migration: supabase/migrations/20260728000100_extensions_and_types.sql
psql:supabase/migrations/20260728000100_extensions_and_types.sql:5: ERROR:  extension "postgis" is not available
DETAIL:  Could not open extension control file "/usr/share/postgresql/16/extension/postgis.control": No such file or directory.
HINT:  The extension must first be installed on the system where PostgreSQL is running.
```

```
$ su postgres -c "psql -tAc \"select name from pg_available_extensions where name in ('postgis','pgtap','citext','pg_cron')\""
citext
```

`pg_prove` is also absent. **I have not verified that any pgTAP assertion passes.**
I am reporting only what the SQL files contain.

Two further notes on that script: `scripts/db/verify-local.sh:8` sets `-euo pipefail`,
yet piping its output to `head` in my invocation reported `EXIT: 0` for a run that
clearly failed. That is my pipeline's exit code, not the script's; do not read it as a
pass. And `supabase/config.toml` pins `major_version = 17` while the local cluster is 16.

---

## 11. History

### Command 1

```
$ git log --format= --name-only | sort | uniq -c | sort -rn | head -25
     11 package-lock.json
      9 package.json
      9 REVIEW_NOTES.md
      8 src/types/database.types.ts
      7 src/app/mic/[id].tsx
      7 app.json
      7 PROJECT.md
      6 supabase/seed.sql
      6 src/app/_layout.tsx
      6 src/app/(tabs)/profile.tsx
      4 src/features/signups/components/signup-card.tsx
      4 src/features/discovery/components/filter-bar.tsx
      4 src/app/producer/night/[occurrenceId].tsx
      4 src/app/producer/[id].tsx
      4 src/app/notification-prefs.tsx
      4 src/app/(tabs)/index.tsx
      4 scripts/db/shim-supabase.sql
      4 ARCHITECTURE.md
      4 .env.example
      3 src/stores/filters.ts
      3 src/features/auth/api.ts
      3 src/components/ui.tsx
      3 src/components/phase-shell.tsx
      3 src/components/logo.tsx
      3 src/app/(auth)/onboarding.tsx
```

### Command 2

```
$ git log --oneline -i --grep="fix" | head -30
9b49bf8 Fix 403 on all REST calls: explicit API role grants
7770c1a Fix 500 on login for seeded users: GoTrue token columns
5289df5 Fix web preview crash: platform-split the native map components
```

### Files in both lists

Only three commits carry "fix" in the subject, touching seven files between them:

```
$ for c in 9b49bf8 7770c1a 5289df5; do echo "--- $c"; git show --format= --name-only $c; done
--- 9b49bf8
supabase/migrations/20260728001200_grants.sql
--- 7770c1a
scripts/db/shim-supabase.sql
supabase/seed.sql
--- 5289df5
src/features/discovery/components/mic-map.web.tsx
src/features/producer/components/pin-picker.tsx
src/features/producer/components/pin-picker.web.tsx
src/features/producer/components/series-form.tsx
```

Intersecting with the top-25 churn list gives exactly two files:

- **`supabase/seed.sql`** (6 commits total, and one of them a fix)
- **`scripts/db/shim-supabase.sql`** (4 commits total, and one of them a fix)

Both were touched by `7770c1a`, "Fix 500 on login for seeded users: GoTrue token columns."

**What this actually tells you, and what it does not.** The signal is honest but thin.
This repository has a short, phase-structured history (commits named "Phase 5",
"Phase 6", and so on) with only three commits that self-describe as fixes. All three
were environment or platform-boundary problems, not logic bugs:

1. Database privilege plumbing (`grants.sql`, which is now the blanket
   `grant all` discussed in section 5).
2. The local-Postgres shim and seed diverging from what real Supabase GoTrue expects.
3. Native-only modules breaking the web target, fixed by `.web.tsx` splits.

The two intersecting files are both **local development environment scaffolding**, not
product code. Read plainly: the thing that has actually kept breaking in this repo is
**reproducing the Supabase environment**, not the application logic. That is directly
relevant to a testing strategy, because it means the pgTAP suite (which is where the
important logic lives) is the part of the system that has historically been hardest to
stand up.

I would not over-read the churn list either. `src/app/mic/[id].tsx` at 7 commits is the
largest source file in the repo (670 lines) and was touched in most feature phases;
that is size and scope, not instability. `package-lock.json`, `package.json`,
`REVIEW_NOTES.md`, `PROJECT.md`, and `database.types.ts` topping the list are
mechanical artifacts.

---

## 12. Your read

Ranked by blast radius, not by likelihood, as asked. Each with a confirmation that fits
in ten minutes.

### 1. Every mutation in the app can silently fail and report success

**Blast radius: the entire write half of the product.** RLS filters rows out of an
UPDATE rather than raising. A denied write returns `{ error: null }`, identical to a
successful one. No mutation in this codebase checks the affected row count. Sites:
`src/features/producer/queries.ts:49,63,86,259`, `src/features/signups/queries.ts:174`,
`src/features/profile/queries.ts:27`, `src/features/safety/queries.ts:162,182`. The
pgTAP suite already documents the zero-row behavior at `supabase/tests/rls.test.sql:57-64`.

Every one of these calls `onSuccess`, invalidates the cache, and shows the user a
confirmation. The refetch quietly restores the old value. A producer who has lost
ownership of a series, a user whose profile is `moderation_status = 'pending'`, or an
admin flag that was revoked all experience "it worked, then it didn't."

**Confirm in ten minutes:** with a local stack up, sign in as the seeded performer,
open a night's roster, and issue `useSetSignupStatus` against a signup on a series they
do not own (or just `curl` the PostgREST PATCH with their JWT). Observe HTTP 204 with
an empty body and no error, then re-read the row and see it unchanged.

### 2. Occurrence generation can stop permanently, with no error anywhere

**Blast radius: the app becomes empty.** Discovery, favorites, reminders, and signups
all key off `mic_occurrences`. Those rows exist only because a pg_cron job tops up a
rolling 90-day window (`.../20260728000800_producer.sql:162-166`). That scheduling block
is wrapped in `exception when others then raise notice`
(`.../20260728000800_producer.sql:167-168`), and the retention schedules have the
identical swallow (`.../20260728001100_retention.sql:126-127`). If `pg_cron` is not
available at migration time, **the migration succeeds** and four scheduled jobs simply
never exist. Nothing logs, nothing alerts. The window decays one day per day. Roughly
three months later, `mics_near` returns rows with `next_starts_at` null and the product
looks dead.

The migration comments acknowledge this and say to schedule externally, but nothing
verifies that anyone did.

**Confirm in ten minutes:** on the target database run
`select jobname, schedule from cron.job;` and expect four rows. Then
`select max(local_date) - current_date from mic_occurrences;` and expect roughly 90.
Anything materially under 90, or a missing `cron` schema, confirms it.

### 3. The blanket grant makes every future table world-writable by default

**Blast radius: total data exposure, one forgotten line away.**
`supabase/migrations/20260728001200_grants.sql:12-14` issues
`grant all on all tables in schema public to anon, authenticated, service_role`, and
`:23-28` extends that to all future objects via `alter default privileges`. Today this
is safe because every table has RLS with default-deny policies, which
`supabase/tests/rls.test.sql:11-19` asserts. But that assertion runs in **no CI**
(section 1: there are no workflow files), so the guard rail is a test nobody runs, and
the failure mode is a new migration that adds a table and forgets
`alter table ... enable row level security`.

This is opinion about risk, not a claim of a present defect: the current schema is
correct as written.

**Confirm in ten minutes:** run the query from `rls.test.sql:11-19` directly against the
target database and expect `0`. Then check whether that query runs anywhere automatically.
It does not.

### 4. The core list ordering is a function of the device's timezone

**Blast radius: the flagship feature ("what can I get to tonight") sorts differently on
different phones, and the test that covers it is silently machine-dependent.**
`src/features/discovery/order.ts:13-16` computes the day bucket with `getFullYear`,
`getMonth`, `getDate`, which read the host timezone rather than the mic's `timezone`
column (which the server does have, and which `mics_near` returns at
`.../20260728000700_discovery.sql:60`). A mic at 8 pm Pacific is "today" for a Seattle
user and "tomorrow" for a user whose phone is set to UTC. Demonstrated in section 6.

Jest pins no `TZ`, so any new boundary-case test here will pass locally and fail in CI,
or vice versa.

**Confirm in ten minutes:**
`TZ=Pacific/Kiritimati npx jest src/features/discovery/order.test.ts` versus `TZ=UTC`,
after adding one fixture with a `starts_at` between 00:00 and 08:00 UTC. The two runs
will disagree.

### 5. The discovery query key contains the entire filters store, including view mode

**Blast radius: redundant network calls and unbounded growth of the persisted cache.**
`src/app/(tabs)/index.tsx:21` does `const filters = useFiltersStore();` with no
selector, so `filters` is the whole store object including `view` and
`disciplinesSeeded`. That object is passed to `useNearbyMics(filters, center)`
(`:50`), which uses it directly as part of the query key
(`src/features/discovery/queries.ts:12`). Confirmed empirically against the installed
`@tanstack/query-core`:

```
$ node -e "const {hashKey} = require('@tanstack/query-core'); ..."
list key: ["mics","near",{"lat":47.6,"lng":-122.3},{"days":[],"disciplines":[],"disciplinesSeeded":false,"freeOnly":false,"methods":[],"radiusKm":40,"timeOfDay":null,"view":"list"}]
map  key: ["mics","near",{"lat":47.6,"lng":-122.3},{"days":[],"disciplines":[],"disciplinesSeeded":false,"freeOnly":false,"methods":[],"radiusKm":40,"timeOfDay":null,"view":"map"}]
keys equal? false
```

Toggling map/list issues a fresh `mics_near` RPC and creates a second cache entry for
identical data. The same happens when `disciplinesSeeded` flips from false to true
during the first-open seeding effect (`src/app/(tabs)/index.tsx:40-44`). Both entries
are then written to AsyncStorage by the persister (`src/app/_layout.tsx:120,130`) with a
24-hour lifetime and no size cap.

**Confirm in ten minutes:** run the node snippet above, then watch the network tab (or
Supabase logs) while tapping the map/list toggle with no filter change. Each tap
produces an RPC.

### Honorable mentions I chose not to rank

- `search_mics` interpolates the query into `ilike '%' || p_query || '%'`
  (`.../20260728000700_discovery.sql:157-161`) without escaping LIKE metacharacters.
  Not injection (it is parameterized), but a user typing `%` matches everything and
  `_` matches any character, and there is no trigram index behind those patterns.
- `mics_near` and `search_mics` never filter `deleted_at is null` or
  `moderation_status = 'approved'` themselves, relying entirely on RLS
  (`.../20260728000700_discovery.sql:76-102`). For a caller who is the series creator,
  the `"series stakeholder select"` policy
  (`.../20260728000300_venues_series.sql:134-136`) has no `deleted_at` condition, so a
  producer's own soft-deleted listings should still surface on their own Discover map.
  I could not run the database to confirm this; treat it as a hypothesis to test, not a fact.
- The client's `signupWindow` (`src/features/signups/window.ts:23`) duplicates the
  server's insert policy (`.../20260728000900_signups.sql:78-79`). Both are tested,
  separately, against nothing shared. They can drift.
- The Edge Function marks the outbox sent regardless of the Expo API response
  (`supabase/functions/push-sender/index.ts:51-66`), so a failed batch is lost silently.

### The one thing I would change before anyone writes a test against this

**Make writes observable.** Every mutation should request the affected rows and assert
on the count, for example `.select('id')` on the update chain and a throw when zero rows
come back.

The reason is not defensive coding, it is testability. Right now a JavaScript test
written against `useSetSignupStatus`, `useConfirmSeries`, or `useUpdateProfile` can
only assert "no error was thrown," and that is true whether the write landed or was
silently discarded by RLS. **A test written today against the write layer cannot fail
for the reason you care about.** That makes the whole mutation surface, which is 16
call sites, effectively untestable no matter how good the harness is.

Everything else on my list can be worked around with a good fixture or a pinned clock.
This one cannot, because the information a test needs is never returned to the client.

---

## UNTESTABLE AS WRITTEN

Proposals only. Nothing in this repository was changed.

**1. Every mutation in `features/*/queries.ts`.**
Cannot distinguish a successful write from an RLS-silenced one. Both yield
`{ error: null }`. Sites: `producer/queries.ts:49,63,86,259`,
`signups/queries.ts:174`, `profile/queries.ts:27`, `safety/queries.ts:162,182`.
_Smallest fix:_ append `.select('id')` to each update chain and throw when
`data.length === 0`. Roughly 8 one-line edits.

**2. The whole write layer's transport.**
No injection point. `getSupabase()` is called inline inside each `mutationFn`,
so a fake requires `jest.mock('@/lib/supabase')`, which tests builder-chain syntax
rather than behavior.
_Smallest fix:_ have each `queries.ts` module take the client from a single
`getClient` indirection that a test can swap, or accept an optional client argument
defaulting to `getSupabase()`.

**3. `src/app/_layout.tsx`.**
Importing it executes `createAsyncStoragePersister` (`:120`) and `initSentry()` (`:122`)
at module scope, so the `AuthGate` redirect state machine (`:60-95`), which is real
branching logic with five outcomes, cannot be imported in isolation.
_Smallest fix:_ move both side effects inside `RootLayout` (a `useMemo` and a `useEffect`),
and export `AuthGate` as a named export.

**4. `resolveProStatus`'s consumer, `useProStatus`.**
`configured` is module-level and one-way (`src/features/pro/use-pro.ts:14,24`);
`apiKey` is resolved at import time (`:9-12`); `__DEV__` is read directly (`:42,51`).
The first test to touch it changes behavior for every later test in the worker.
_Smallest fix:_ move `configured` into a module-exported `resetPurchasesForTest()`,
or keep a `Map` keyed by userId instead of a boolean.

**5. `supabase/functions/push-sender/index.ts`.**
`Deno.serve(async (req) => {...})` at `:9` with nothing exported. Also outside
`tsconfig.json` (`:12`) and ESLint (`eslint.config.js:10`), so it is not even
typechecked today.
_Smallest fix:_ `export async function handler(req: Request, deps): Promise<Response>`
and pass it to `Deno.serve(handler)`. Then remove it from the tsconfig exclude.

**6. `draw_lottery`'s outcome.**
Uses unseeded SQL `random()` (`.../20260728000900_signups.sql:107`). No specific draw
result is assertable.
_Smallest fix:_ none needed, and I would not change it. Test the invariants instead:
exactly `min(capacity, entrants)` rows become `drawn`, positions are `1..n` with no
gaps, the rest are `waitlisted`, no `performed` row is disturbed. Those are all
determinate. If a seeded draw is ever wanted, add an optional `p_seed` parameter that
calls `setseed()`, defaulting to null.

**7. Anything that renders a native map or a picker.**
`react-native-maps` (`mic-map.tsx:3`) and `expo-image-picker` (`avatar.ts:2`,
`poster.ts:2`) have no jsdom-safe path. The `.web.tsx` variants are testable but are
different components with different behavior.
_Smallest fix:_ extract the clustering math (`regionToZoom` at `mic-map.tsx:24-26`, the
bbox padding at `:57-68`) into a pure module beside the component. That is the part
worth testing, and it currently cannot be reached without importing the native map.

**8. `googleCalendarUrl` in a native-free environment.**
Pure and already tested, but it shares a module with `addToCalendar`, which imports
`expo-calendar` and `react-native` at `calendar.ts:1-2`. The existing test only passes
because `jest-expo` provides those mocks.
_Smallest fix:_ split `googleCalendarUrl` into `calendar-url.ts` with no imports.

**9. Timezone-sensitive date logic.**
`order.ts:13-16` and `filters.ts:84-87` read the host timezone, and Jest pins no `TZ`
(`package.json:78-84`).
_Smallest fix:_ add `"globalSetup"` or simply `process.env.TZ = 'UTC'` in a
`jest.setup.js` referenced by `setupFiles`, so the suite is at least deterministic.
Separately, and larger, `sortSoonestNearest` should take the mic's `timezone` (already
returned by `mics_near` at `.../20260728000700_discovery.sql:60`) rather than using
the device's.

**10. The pgTAP suite, in this environment and in CI.**
Requires PostGIS and pgTAP, neither available here
(`select name from pg_available_extensions ...` returned only `citext`), and `pg_prove`
is not installed. There is no workflow file to run it in.
_Smallest fix:_ a single GitHub Actions workflow running
`supabase start && supabase test db` alongside `npm run typecheck && npm run lint && npm test`.
This is the highest-value change in this whole list: it is where the business logic
actually lives, and it is the one suite nobody is running.

**11. The client/server duplication of the signup window.**
`src/features/signups/window.ts:23` and
`supabase/migrations/20260728000900_signups.sql:78-79` implement the same rule twice.
Each is tested against itself. No test compares them.
_Smallest fix:_ a single contract test that feeds the same fixture set through both,
which requires the pgTAP suite to be runnable from the same CI job as Jest, so this
depends on item 10.

**12. The Realtime path.**
`src/features/signups/queries.ts:87-110` needs a live WebSocket. The handler ignores its
payload entirely (`:101`), so there is nothing to unit test even with a fake frame; the
only observable behavior is "two `invalidateQueries` calls fire."
_Smallest fix:_ extract the effect body into an exported
`subscribeToRoster(client, occurrenceId, onChange)` so the subscribe/teardown pairing
can be asserted against a fake client without React.
