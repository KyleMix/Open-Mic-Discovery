# Running the app on a PC

Three ways to drive the app from a desktop, fastest first. All three talk to
the same local Supabase stack, so the data and the demo accounts are identical.

| Way                | Start cost       | What you get                                  |
| ------------------ | ---------------- | --------------------------------------------- |
| Browser            | seconds          | Every screen except the map. Fastest loop.    |
| Android emulator   | one-time install | The real app, real map, real native behavior. |
| Expo Go on a phone | scan a QR code   | Real touch and GPS, no emulator overhead.     |

## One-time setup

Prerequisites: Node 22+, Docker Desktop (WSL2 backend on Windows).

```bash
npm install
npm run dev:up      # starts Supabase, then writes .env for you
```

`npm run dev:up` is `supabase start` followed by `scripts/dev/sync-env.mjs`,
which reads the running stack and writes `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` into `.env`. Do not copy the anon key by hand.
It changes every time the stack is recreated, and a stale key fails in a way
that looks like a code bug: the app builds, every request comes back 401.

First `supabase start` pulls about a dozen images. Later starts are quick.

## 1. Browser (fastest loop)

```bash
npm run web
```

Opens on `http://localhost:8081`. Fast refresh, and Chrome DevTools work
normally, which is the real reason to use it: React DevTools, the network tab,
and breakpoints all behave like a normal web app.

What is different in the browser:

- **No map.** `react-native-maps` is native-only. `mic-map.web.tsx` renders the
  same mics as a distance-ordered list with a note saying so. Discover defaults
  to the list view anyway, so most flows are unaffected.
- **No push notifications.** Test those on a device build.
- **Producer Pro is unlocked.** RevenueCat's native module is absent, and dev
  builds treat unconfigured as unlocked so Pro screens stay reachable.
- **No Apple sign in.** iOS only. Use email and password.

## 2. Android emulator (most faithful)

Install Android Studio, create a device under Device Manager, start it, then:

```bash
npm run dev:env -- --android-emulator
npm run android
```

The extra `dev:env` run matters. Inside the emulator `127.0.0.1` is the
emulator itself, not your PC, so the default `.env` cannot reach Supabase. The
emulator aliases your machine's loopback to `10.0.2.2`, and that flag writes
that address instead. Skipping this is the usual reason sign-in spins forever
on the emulator while the browser works fine.

Switch back with a bare `npm run dev:env` before returning to the browser.

## 3. Expo Go on a phone

```bash
npm run dev:env -- --lan
npm start
```

Scan the QR code with Expo Go. `--lan` writes your machine's LAN IP so the
phone can reach Supabase. The phone and the PC must be on the same network, and
Windows Firewall has to allow Node on a private network.

Expo Go skips push (SDK 53 dropped it), `expo-age-range`, and RevenueCat. The
app handles all three explicitly, so it boots and runs.

## Signing in

Demo accounts come from `supabase/seed.sql`. Full list in `REVIEW_NOTES.md`.

| Role      | Email                                | Password       |
| --------- | ------------------------------------ | -------------- |
| Performer | performer@demo.openmicexplorer.local | demo-pass-1234 |
| Producer  | producer@demo.openmicexplorer.local  | demo-pass-1234 |
| Dual role | dual@demo.openmicexplorer.local      | demo-pass-1234 |
| Admin     | admin@demo.openmicexplorer.local     | demo-pass-1234 |

The seed loads 20 Pacific Northwest mics, so Discover has content immediately.

## Resetting data

```bash
npm run db:reset          # re-applies migrations and reloads the seed
npm run dev:env           # only if the stack was recreated, not just reset
```

Reach for this after pulling migrations, or once test data gets messy.

## Checking the database without Docker

`scripts/db/verify-local.sh` applies every migration, loads the seed, and runs
the pgTAP suite against a system Postgres. It needs `postgresql-16-postgis-3`
and `postgresql-16-pgtap`. It verifies the schema only, with no Supabase API,
so the app cannot point at it. Useful in CI and on machines without Docker.

## When something looks broken

| Symptom                                     | Cause                                                    |
| ------------------------------------------- | -------------------------------------------------------- |
| Every request 401s                          | Stale anon key. Run `npm run dev:env`.                   |
| Sign-in hangs on emulator, fine in browser  | Wrong host. Run `npm run dev:env -- --android-emulator`. |
| Sign-in hangs on phone                      | Run `npm run dev:env -- --lan`, check the firewall.      |
| `Missing environment variable EXPO_PUBLIC_` | No `.env`. Run `npm run dev:up`.                         |
| Env changes appear to do nothing            | Expo inlines `EXPO_PUBLIC_` at build. Restart it.        |
| Metro serves a stale bundle                 | `npx expo start --clear`.                                |
