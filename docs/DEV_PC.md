# Running the app on a PC or in a Codespace

Ways to drive the app without a physical device, fastest first. All of them
talk to the same local Supabase stack, so data and demo accounts are identical.

| Way                | Start cost       | What you get                                  |
| ------------------ | ---------------- | --------------------------------------------- |
| Browser            | seconds          | Every screen except the map. Fastest loop.    |
| GitHub Codespace   | seconds          | Same as the browser, nothing installed local. |
| Android emulator   | one-time install | The real app, real map, real native behavior. |
| Expo Go on a phone | scan a QR code   | Real touch and GPS, no emulator overhead.     |

Only the Supabase URL differs between them, and `npm run dev:env` writes the
right one. See "Picking the right Supabase host" below, which is the single
thing most likely to waste an afternoon.

## One-time setup

Prerequisites: Node 22+, Docker (Docker Desktop with the WSL2 backend on
Windows; already present in a Codespace).

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
- **No Apple sign in.** iOS only. Use email and password.

## 2. GitHub Codespace

```bash
npm run dev:up
npm run web
```

Open `http://127.0.0.1:8081`, the address the dev server prints. VS Code tunnels
forwarded Codespace ports to your own machine, so that works, and `54321`
tunnels the same way. Loopback is therefore the correct default in a Codespace,
not a mistake.

**Forward port 54321 by hand.** In the Ports panel, click Add Port and enter
`54321`. Leave it Private. Codespaces only auto-forwards ports it detects, and
it detects `8081` because the Expo dev server announces it, but Supabase binds
inside Docker and usually goes unnoticed. Without that forward, the browser
cannot reach `http://127.0.0.1:54321` even though everything inside the
Codespace can, so `npm run dev:doctor` will report the stack as perfectly
healthy while the app fails with `ERR_CONNECTION_REFUSED`.

**The two addresses have to match.** The app's origin and the Supabase URL must
be the same kind of address:

| Open the app at                      | Supabase URL must be                  | Command                          |
| ------------------------------------ | ------------------------------------- | -------------------------------- |
| `http://127.0.0.1:8081`              | `http://127.0.0.1:54321`              | `npm run dev:env` (default)      |
| `https://<name>-8081.app.github.dev` | `https://<name>-54321.app.github.dev` | `npm run dev:env -- --codespace` |

Mixing them is the trap. A page served from `http://127.0.0.1:8081` calling
`https://<name>-54321.app.github.dev` is cross-origin, and GitHub's proxy does
not answer the preflight with an `Access-Control-Allow-Origin` header, so every
request dies with:

```
blocked by CORS policy: Response to preflight request doesn't pass access
control check: No 'Access-Control-Allow-Origin' header is present
```

If you take the `--codespace` route, port `54321` must also be set to Public, and
Public means anyone with the URL can reach your dev database while the Codespace
lives.

## 3. Android emulator (most faithful)

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

## 4. Expo Go on a phone

```bash
npm run dev:env -- --lan
npm start
```

Scan the QR code with Expo Go. `--lan` writes your machine's LAN IP so the
phone can reach Supabase. The phone and the PC must be on the same network, and
Windows Firewall has to allow Node on a private network.

Expo Go skips push (SDK 53 dropped it) and `expo-age-range`. The app handles
both explicitly, so it boots and runs.

## Picking the right Supabase host

Supabase binds to `127.0.0.1` inside whatever machine runs it. Whether that is
reachable depends entirely on where the app is running.

| Running the app in                   | Command                                 | Supabase URL written                  |
| ------------------------------------ | --------------------------------------- | ------------------------------------- |
| Browser, same machine                | `npm run dev:env`                       | `http://127.0.0.1:54321`              |
| Codespace, app at `127.0.0.1:8081`   | `npm run dev:env`                       | `http://127.0.0.1:54321`              |
| Codespace, app at `*.app.github.dev` | `npm run dev:env -- --codespace`        | `https://<name>-54321.app.github.dev` |
| Android emulator                     | `npm run dev:env -- --android-emulator` | `http://10.0.2.2:54321`               |
| Phone on the same Wi-Fi              | `npm run dev:env -- --lan`              | `http://<your-lan-ip>:54321`          |
| Force loopback                       | `npm run dev:env -- --localhost`        | `http://127.0.0.1:54321`              |

Get this wrong and the app builds, loads, and then hangs or 401s on sign-in,
which looks like an auth bug rather than a networking one.

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

Run this first. It checks the stack, the key, the host, and what the Supabase
URL actually answers with, then prints the fixes in the order to apply them:

```bash
npm run dev:doctor
```

`AuthRetryableFetchError: Failed to fetch` in the browser console is worth
calling out, because four unrelated causes all produce that one message and the
browser will not say which: the stack is down, the key is stale, the URL is a
host the browser cannot reach, or the Codespace port is private. `dev:doctor`
distinguishes them.

### Symptoms and causes

| Symptom                                     | Cause                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Every request 401s                          | Stale anon key. Run `npm run dev:env`.                                                        |
| Sign-in hangs on emulator, fine in browser  | Wrong host. Run `npm run dev:env -- --android-emulator`.                                      |
| Sign-in hangs on phone                      | Run `npm run dev:env -- --lan`, check the firewall.                                           |
| `AuthRetryableFetchError: Failed to fetch`  | Run `npm run dev:doctor`, which tells you which cause it is.                                  |
| `blocked by CORS policy` in a Codespace     | App origin and Supabase URL are different kinds of address. Match them (see Codespace above). |
| Codespace: doctor is clean, browser refuses | Port 54321 is not in the Ports panel. Add Port, `54321`.                                      |
| `npm error Missing script: "dev:up"`        | Checkout predates the script. `git pull && npm install`.                                      |
| `Missing environment variable EXPO_PUBLIC_` | No `.env`. Run `npm run dev:up`.                                                              |
| Env changes appear to do nothing            | Expo inlines `EXPO_PUBLIC_` at build. Restart it.                                             |
| Metro serves a stale bundle                 | `npx expo start --clear`.                                                                     |
