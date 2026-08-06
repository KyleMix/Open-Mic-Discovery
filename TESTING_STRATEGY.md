# Testing strategy

Living document. Records what is tested where, why that layer and not another,
and what is deliberately left uncovered.

## The shape of this system

Most of the rules in this product are in Postgres, not in JavaScript. Sixteen
migration files hold the signup lifecycle, occurrence generation from an RRULE
subset, DST-correct scheduling, reconciliation on series edit, freshness
stamping, moderation, ownership and claims, and account deletion. They are
enforced by RLS policies, CHECK constraints and PL/pgSQL triggers.

The client is a thin read, render and dispatch layer over one network
boundary. `getSupabase()` is a single named export and every call site imports
it by name.

A strategy weighted toward JavaScript would cover the minority of this system.
The weighting below follows the code.

## Layers

### SQL (pgTAP), the primary layer

`supabase/tests/*.test.sql`, run by `supabase test db` in CI and by
`scripts/db/verify-local.sh` on a machine without Docker.

This is where the business rules are, so this is where most assertions are.
pgTAP is a genuinely good boundary and needs no fakes: it impersonates roles
with `set local role` plus `request.jwt.claims`, exactly the mechanism the
platform uses, inside a transaction that rolls back. A test can therefore ask
"what can this actual role actually see" rather than "did we call the right
helper".

Nothing here is simulated, so nothing here can drift from production the way a
mock can. That is the argument for pushing assertions down to this layer
whenever a rule has a SQL home: a rule tested in SQL is tested against the
thing that enforces it.

Two files were added:

- `grants-and-rls.test.sql`. The grants migration hands `all` on all tables to
  `anon`, `authenticated` and `service_role` and extends that to future objects
  with `alter default privileges`. That is safe only because every table has
  RLS with default-deny policies, which makes RLS the only guard rail rather
  than the second one. The file asserts no table is missing RLS (naming the
  offender, not counting), that every RLS table has a policy except the
  deliberately policy-free outbox, and then demonstrates the hazard directly by
  creating a table inside the rolled-back transaction and showing `anon`
  already holds SELECT and INSERT on it.
- `scheduled-jobs.test.sql`. Both pg_cron scheduling blocks are wrapped in
  `exception when others then raise notice`, so a database without pg_cron
  applies every migration successfully and ends up with no jobs at all. The
  nightly generator is what tops up the rolling occurrence window, so its
  absence decays the window by one day per day until discovery shows nothing
  upcoming. The file asserts all four jobs exist, with their schedules and
  their target functions.

`scheduled-jobs.test.sql` is deliberately not conditional on pg_cron being
present. An environment without pg_cron cannot run this product correctly, and
a test that skipped itself there would report success for a broken deployment.
`verify-local.sh` does skip it when pg_cron is absent, because pg_cron needs
`shared_preload_libraries` and can only live in one database, but it says so
loudly and points at CI.

### Pure functions (Jest)

Thirteen suites already cover the pure modules: validation, recurrence, the
RRULE builder, the signup window, freshness, distance, ordering, social links,
home area, pro status, filter helpers, the calendar URL builder, and the WCAG
contrast assertions on the theme tokens. These are cheap, fast and already
good. Nothing was added to them.

The one deliberate purity boundary in the repo, `resolveProStatus(configured,
devBuild, rcEntitled)`, is fully parameterized and needs nothing further.

Clock is already a parameter on `freshness`, `signupWindow`,
`validateBirthYear`, `computeAnchorDate`, `dayQuickPick` and
`sheetFilterCount`. Where a seam exists, use it rather than mocking time.

### Hooks (Jest, through the network seam)

`jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }))` intercepts
the entire network boundary in one statement, because every call site imports
that one named export.

This layer exists for behaviour that only appears when a hook meets a server
response: a refused write, a Realtime event, a query key. It is not for
asserting that a query builder was chained in a particular order. A test that
asserts `.from().update().eq()` was called in that sequence is a test of the
Supabase client's API, not of this application, and it fails on a harmless
refactor while passing on a real regression.

The factory form of `jest.mock` matters. Automocking loads the real module to
derive its shape, which pulls in AsyncStorage's native binding, which does not
exist under Jest.

### Components and screens (Jest, React Native Testing Library)

`CLAUDE.md` requires every screen to handle loading, empty, error and success
explicitly. Nothing held any screen to that, so a dropped state would surface
in review or in the store.

`src/app/(tabs)/favorites.test.tsx` is the pattern: five states including
signed out, asserted through what a person would see and reach for (the
wording, the presence of a retry control) rather than through the component
tree. It was checked by deleting the empty-state branch and confirming that
exactly one test failed.

Screens are tested where they are reachable without fighting the router.
`favorites.tsx` needs only `useRouter` and `useSession` stubbed.

### End to end (Maestro)

`.github/workflows/e2e.yml` builds the Android app and runs the Maestro flows
on an emulator. That workflow is not this work's; it already existed. The CI
added here is the complementary half: typecheck, lint, the unit suite, the
unit suite again in a second timezone, and the pgTAP suite, none of which ran
on push.

The two are worth keeping separate. The e2e job takes a prebuild, a Gradle
build and an emulator boot, so it is minutes per run and carries the flake
profile that comes with a device. The checks in `ci.yml` finish in well under
a minute and should gate every push; e2e answers a different question, which
is whether the thing starts and can be driven.

## Fixtures and fakes

### Where they live

- `src/test/supabase-fake.ts`: the fake for the one network boundary.
- `src/test/query-harness.tsx`: a QueryClient scoped to a single test.
- Domain fixtures: inline in the test that uses them.
- SQL fixtures: `supabase/seed.sql`, four seeded users (performer, producer,
  dual role, admin) plus 20 series and 18 venues.

### The shape of the fake

`createFakeSupabase(handler)` takes a function that receives the _intent_ of a
call (which table, which verb, single or not) and returns a reply. Tests then
assert on what the hook did with that reply.

It is deliberately not a mock PostgREST server. It does no filtering, holds no
rows and understands none of the operators. Building one would mean
maintaining a second, worse implementation of Postgres, and every test written
against it would be a test of that implementation. Where a test needs real
filtering, real policies or real constraints, it belongs in pgTAP, where those
things are real.

The fake also fakes Realtime channels, with `emitRealtime()` to fire a
subscribed callback and `openChannels()` to observe teardown, and supports a
handler that returns a promise so a test can hold a request open and observe a
loading state.

### Why the two suites do not share domain fixtures

They cannot share them mechanically: the JS suite never touches a database and
the SQL suite never runs JavaScript. Sharing would mean generating one from the
other, and the cost is not worth it.

More importantly it would be wrong. The SQL fixtures exist to exercise
policies, so they are shaped by who owns what and who is blocked by whom. The
JS fixtures exist to stand in for a server response, so they are shaped by the
columns a screen reads. Coupling them would make JS tests fail when seed data
changes for reasons that have nothing to do with the client.

What they do share is the schema, through
`src/types/database.types.ts`. That file is generated from the migrations, and
it is what makes the JS fixtures fail to compile when a column changes. That is
the right coupling: types, not rows. It caught a wrong column name in the write
tests during this work.

### Timezone

Pinned to UTC in `jest.global-setup.js`, not in `setupFiles`. Jest gives each
test file a sandboxed copy of `process.env`, so assigning `TZ` inside a test or
a setup file never reaches the runtime that `Date` reads and silently does
nothing. `globalSetup` runs in the parent process before workers fork.

An explicitly provided `TZ` wins, which is what lets CI re-run the whole suite
in a second zone to catch assertions that depend on the host machine.

## Build order, and why

1. **CI first, before any test.** A test that runs nowhere is documentation.
   The pgTAP suite was the sharpest case: it holds most of the business logic,
   its pass state had never been confirmed by anyone, and it ran on no machine
   automatically. It passes, 10 files and 128 tests, now 12 and 145.
2. **The source change that makes write tests possible.** Until an update
   reported a refusal, any test of the write layer could only assert "nothing
   threw", which was true whether the write landed or was discarded. Writing
   tests first here would have produced tests that could not fail for the
   reason they claimed.
3. **The write layer.** Sixteen write sites, no coverage, and the one place
   where a silent failure costs a producer their listing or a performer their
   slot.
4. **The SQL gaps.** Cheapest assertions per unit of risk, because pgTAP needs
   no fakes.
5. **Query keys and ordering.** Both are verified defects with user-visible
   consequences and no source fix authorized, so both are recorded as
   `test.failing`.
6. **Screens and Realtime.** Largest surface, slowest tests, most churn. Last,
   and sampled rather than exhausted.

## Known defects recorded as `test.failing`

Two defects need a source change this work was not authorized to make. Rather
than assert the buggy behaviour (which locks it in) or skip it (which hides
it), the correct assertion is written and marked `test.failing`. Jest passes
the test while the body fails and turns the file **red the moment someone fixes
the source**, which is the prompt to delete the marker.

| Defect                                                      | File                                            | Smallest fix                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Day bucketing reads the host timezone, not the mic's        | `src/features/discovery/order.timezone.test.ts` | Add `timezone` to `Sortable` and bucket with `Intl.DateTimeFormat('en-CA', { timeZone })` |
| Discovery query key captures `view` and `disciplinesSeeded` | `src/features/discovery/query-key.test.tsx`     | Select in the screen instead of passing the whole store                                   |

Both were verified by temporarily applying the fix and confirming the marked
tests go red while the existing suites stay green.

## Known flake

The Jest suite has failed exactly one test on two separate occasions and
passed on every other run, twelve consecutive times after the second sighting.
Neither failure was captured with the test name attached, so it is not yet
known which one it is.

It is worth naming rather than ignoring. The candidates are the tests that
wait on asynchronous state: the roster Realtime test, the query key test, and
the favorites screen test all use `waitFor`, and the module-scope singletons
this repo has (the memoized `getSupabase()`, the zustand filters store) are the
usual reason a test passes alone and fails alongside others.

CI prints the failing test name, so the next occurrence identifies it. Do not
paper over it with retries: a suite that passes on the second attempt is a
suite nobody reads the first result of.

## Not tested, and what that costs

**That the app starts, in the unit and SQL layers.** Both suites can be fully
green while the app fails to boot. This is not hypothetical: a screen test
placed under `src/app` became a real Expo Router route, shipped a Jest file
into the bundle, and crashed the app on launch with "expect is not defined"
while 121 tests reported success. `src/app-routes.test.ts` closes that
specific hole, and `e2e.yml` covers booting in general, but nothing cheap and
fast asserts that the bundle builds. `npx expo export --platform web` is the
command that catches it in seconds and is worth adding to `ci.yml`.

**`src/app` as a source directory.** Anything placed there becomes a route.
Screen tests therefore live beside their feature and import the route module
by path. The guard test enforces it, but the constraint is easy to forget and
the failure mode is silent in Jest.

**`AuthGate` in `src/app/_layout.tsx`.** Five distinct redirect outcomes, no
coverage. Not covered because `initSentry()` runs at module import, before any
component mounts, and the module also constructs the AsyncStorage persister and
the `queryClient` singleton at import time. Testing it means either importing
those side effects or mocking four modules to neutralise them, and the second
produces a test that mostly asserts the mocks. The cost: a wrong redirect can
strand a user on the EULA screen or bounce a signed-in user to sign-in, and
only a person running the app would notice. The smallest change that would make
this testable is exporting `AuthGate` from its own module and moving
`initSentry()` into a component effect.

**The map and its clustering math.** `mic-map.tsx` needs native
`react-native-maps`. Only the `.web.tsx` split resolves under Jest, and it is a
different implementation, so testing it would assert something users never run.
The clustering math is worth extracting and testing as a pure function, which
is a source change. The cost: marker grouping and the zoom thresholds are
unverified, and a clustering bug shows up as pins in the wrong place.

**`supabase/functions/push-sender/index.ts`.** Excluded from both `tsconfig.json`
and `eslint.config.js`, so it is not typechecked, not linted and not tested. It
is a Deno Edge Function and the repo has no Deno toolchain. The cost is real:
this is the process that drains the notification outbox, it runs under the
service role, and a mistake there is both a delivery failure and a privilege
question. Untested by omission rather than by decision, and it should get a
Deno test task of its own.

**The remaining screens.** `favorites.tsx` is covered as the pattern; the other
fourteen route files are not. Three of them exceed 480 lines and hold their own
logic, which is what makes them expensive to test and is also the reason they
should be split. Splitting them was out of scope here. The cost: the four-state
requirement is enforced on one screen and trusted on the rest.

**Mutation call shapes.** No test asserts that a hook called `.update()` with a
particular payload. That is deliberate, per the reasoning in the hooks section.
The cost: a hook that writes the wrong column is caught by TypeScript and by
pgTAP, but not by the hook tests.

## Running things

```
npm run typecheck
npm run lint
npm test
TZ=America/Los_Angeles npm test     # what the CI timezone job runs

npm run db:start && npx supabase test db   # canonical, needs Docker
bash scripts/db/verify-local.sh            # no Docker, needs system Postgres,
                                           # PostGIS, pgTAP, ideally pg_cron
```
