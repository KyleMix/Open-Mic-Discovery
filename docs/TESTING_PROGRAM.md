# Getting the app to testers

Android APK, distributed as a link. No Play Console account, no store review,
no cost. Testers tap a link and install.

This covers two audiences: the setup you do once, and the page you send to
testers.

---

## Part 1: the one-time setup

### 1. Host the backend

Nothing else works until this is done. The app currently points at
`http://127.0.0.1:54321`, which exists only on your machine. A build made
against that installs fine and then fails for every tester with "Could not
load mics", which reads as a broken app rather than a missing backend.

Create a project at supabase.com, then from the repo:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`db push` applies every migration in `supabase/migrations/`. It does not load
`supabase/seed.sql`; seed data is a separate, deliberate step (see below).

### 2. Give the project something to show

A tester opening an empty Discover screen cannot tell a working empty state
from a broken query, so the project needs listings in it before anyone else
sees it. Use the in-app test kit, not the seed file.

**Do not run `supabase/seed.sql` against a hosted project.** It creates demo
accounts with passwords that are committed to a public repository, including
an admin account. That is fine for a database only your machine can reach and
wrong for anything on the internet.

Instead:

1. Run the app against the hosted project and sign up with the owner email
   listed in `private.owner_emails()`. A trigger grants that account the
   performer, producer and admin roles automatically, on any environment
   (`20260801000100_test_kit.sql`). You choose the password, and it is never
   written down anywhere.
2. Profile tab, **Testing tools**.
3. Build the situations you want testers to find: a week of listings across
   every discipline and price, a night starting shortly with a roster on it, a
   lottery waiting to be drawn, listings in each freshness state.

Everything the kit creates is tracked in a registry so it can be removed again
exactly, without touching anything else. The migrations already insert the
EULA versions, so onboarding works on a project with no other data in it.

### 3. Turn off email confirmation

Dashboard, Authentication, Sign In / Providers, Email: turn **Confirm email**
off.

Hosted projects enable it by default, and the app cannot cope with it.
`signUpWithEmail` calls `auth.signUp` and the sign-up screen assumes a session
exists as soon as it returns, because the root gate routes on the session. With
confirmation on, Supabase returns a user, a null session and no error, so the
screen finds nothing wrong and routes nowhere. The tester taps Create account,
sees no error and no progress, and reasonably concludes the app is broken.

`supabase/config.toml` sets `enable_confirmations = false`, but that file
configures the local stack only and has no effect on a hosted project.

Leaving it on is not an option either way: the built-in email sender on the
free tier is rate limited to a handful of messages an hour and is not intended
for real delivery, so most testers would never receive the message.

Anyone who already signed up before this was turned off is stuck. Disabling
confirmation does not retroactively confirm an existing account, so delete
those users under Authentication, Users, and have them sign up again.

### 3b. Allow the app's own redirect URLs

Authentication, URL Configuration, Redirect URLs: add `openmicexplorer://**`.

Supabase ships with a Site URL of `http://localhost:3000` and rejects any
redirect not on the allow list, falling back to that default. On a phone
`localhost:3000` is the phone itself, so the browser opens to a connection
refused page.

This matters even with confirmation off, because password reset always emails
a link. `sendPasswordReset` asks Supabase to redirect to
`Linking.createURL('reset-password')`, which resolves to
`openmicexplorer://reset-password` and deep-links back into the app. Without
the allow-list entry, every tester who forgets their password lands on a dead
localhost page instead.

### 3c. Let the notification outbox drain

Notifications are queued by the database and sent by the push-sender Edge
Function, and a scheduled job calls it every minute. That job needs the
function's URL and the service role key, which are read from Vault so neither
ends up in the schema or in git. Run once, in the SQL editor:

```sql
select vault.create_secret(
  'https://<ref>.supabase.co/functions/v1/push-sender', 'push_sender_url');
select vault.create_secret('<service-role-key>', 'push_sender_key');
```

The service role key is on the API Keys page under Secret keys. It bypasses
row level security completely, so it belongs here and nowhere near the app.

Deploy the function itself with `npx supabase functions deploy push-sender`.

Until both secrets exist the job raises on every run rather than returning
quietly, which is deliberate: a drain that failed silently would look exactly
like the bug it was written to fix.

### 4. Point builds at it

The two values the app needs are public by design (see `ARCHITECTURE.md`), but
they still belong in EAS rather than in git.

Take the key from Project Settings, API Keys, **Publishable key**. On newer
projects it starts `sb_publishable_`; on older ones it is a long `eyJ...` JWT
under the legacy tab. Either works. The **secret key** on the same page must
never go near the app: it bypasses row level security entirely, and anything
built into an APK can be read out of it.

```bash
npx eas-cli env:set --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
npx eas-cli env:set --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-key>
```

If EAS refuses with "Slug for project identified by extra.eas.projectId does
not match the slug field", `slug` in `app.json` has drifted from the project
the id points at. Change `app.json` to match the server, not the other way
round: an Expo project's slug is fixed when the project is created and the
dashboard only lets you edit the display name, which is a different field.

The slug is an Expo-side identifier. It is not the app's name, its scheme, or
its bundle id, so aligning it changes nothing a user sees.

Do not run `eas init --force` to get past this: it mints a new project id and
orphans the Android signing key, so already-installed copies can no longer be
upgraded in place and every tester has to uninstall and reinstall.

The `preview` build profile in `eas.json` declares `"environment": "preview"`,
which is what binds those variables to the build. If your EAS CLI rejects that
field, upgrade the CLI; failing that, move the two values into an `env` block
on the profile instead.

### 5. Verify before you build

```bash
npm run check:backend https://<ref>.supabase.co <anon-key>
```

This refuses to pass on the failures that are invisible from the app side: a
loopback URL, a cleartext URL (Android blocks those on device), a rejected
key, missing migrations, a missing EULA row (which strands everyone on the
consent screen), and an empty listings table. Do not build until it prints
`Backend ready`.

### 6. Build

The EAS CLI is published as `eas-cli` while its binary is called `eas`, so
`npx eas ...` fails to resolve. Use the package name, or install it once with
`npm install -g eas-cli` and drop the `npx eas-cli` prefix everywhere below.

```bash
npx eas-cli login
npm run build:android
```

That runs `npx eas-cli build --profile preview --platform android`, which produces an
**APK** (not an AAB, which cannot be sideloaded). EAS returns a build page with
a QR code and a download link. That link is what you send.

Rebuild for native or config changes. For pure JavaScript changes you can push
an update to installed copies instead, which is much faster:

```bash
npx eas-cli update --branch preview --message "what changed"
```

### 7. Before sending the link

- **Rotate the Google Maps API key.** `app.json` has a live key committed to a
  public repository, so it is in the git history and must be assumed exposed.
  Rotate it in Google Cloud Console, and restrict the new one to the Android
  package `com.openmicexplorer.app` plus your release signing certificate's
  SHA-1 fingerprint (`npx eas-cli credentials` shows it). An unrestricted Maps key
  is billable by anyone who finds it.
- **Check the deep links.** `app.json` still routes `openmicfinder.app/mic/`,
  which is the pre-rebrand domain. Links shared from the app will not open in
  it unless you own and configure that domain.

---

## Part 3: iPhone, when you want it

There is no free route onto someone else's iPhone. Apple requires a Developer
Program membership (99 USD a year) for any install on a device you do not
physically hold, and Expo Go is not a way round it: this app depends on
Sentry, react-native-maps and expo-apple-authentication, none of which Expo Go
carries.

Two routes exist once you are enrolled.

**TestFlight** is the one to use. Testers install Apple's TestFlight app and
your build appears in it, with updates arriving the same way. Up to 10,000
external testers. Each build for external testers goes through a Beta App
Review, which is lighter than App Store review and usually clears within a
day. Internal testers (up to 100, each needing an App Store Connect account)
skip review entirely.

**Ad hoc internal distribution** works like the Android APK: a link, no
review. It is not worth it here. You must collect the UDID of every tester's
device, you are capped at 100 devices a year, and adding one person means a
rebuild. Asking a comedian to find their device UDID is a good way to lose
them before they open the app.

### Steps

1. Enrol at developer.apple.com/programs. Approval can take a day or two, so
   start here.
2. In App Store Connect, create an app record using the bundle identifier
   already in `app.json`: `com.openmicexplorer.app`.
3. Build and submit:

```bash
npm run build:ios
npm run submit:ios
```

4. App Store Connect, TestFlight tab: add testers by email, or create a public
   link that anyone can use.

The `testflight` profile extends `preview`, so iOS builds take the same
Supabase environment variables and the same `preview` update channel as the
Android testers. One `eas update --branch preview` reaches both.

### Before the first iOS build

- **Sign in with Apple has to work.** Apple requires it wherever you offer
  Google sign-in (Guideline 4.8). It is already implemented; it needs the
  capability enabled on the App ID, which EAS does when it creates the
  credentials.
- **`associatedDomains` still points at `applinks:openmicfinder.app`**, the
  pre-rebrand domain, the same staleness the Android `intentFilters` carry.
  Universal links will not work until that domain is one you own and serve an
  apple-app-site-association file from.
- iOS uses Apple Maps and needs no map key, so the Google Maps key problem is
  Android-only.

---

## Part 2: the page to send testers

Copy everything below into an email, a message, or a page.

---

### Trying Open Mic Explorer

Thanks for testing. This is an early build, so expect rough edges. That is what
you are here to find.

**Android only for now.** iPhone is not available yet.

#### Installing

1. Tap the link I sent you and download the file.
2. Android will warn that the file can harm your device. That warning appears
   for anything not installed from the Play Store, including this. Choose
   **Install anyway**.
3. If it asks you to allow installs from your browser or file manager, say yes.
   You can turn that back off afterwards.
4. Open **Open Mic Explorer**.

#### Signing in

Create your own account with an email and password. It does not need to be a
real address you check, but write down what you used.

You will be asked to accept the terms, pick whether you perform or run mics
(you can pick both), and enter a home area. The home area is private and is
only used to decide which mics are near you.

#### What would help most

Use it like you would actually use it, then tell me:

1. **Where did you get stuck?** Any moment you were not sure what to tap, or
   expected something to happen and it did not. These are the most useful
   reports and the easiest to forget, so send them as they happen.
2. **Find a mic you would actually go to.** Did the search, filters, and
   distances get you there? Was anything wrong or confusing about the listing?
3. **Get on a list.** Sign up for a night. Was it clear whether you were on,
   waitlisted, or neither?
4. **If you run a mic,** add a listing from the My Mics tab, set its schedule,
   and run the signup list on the night. This is the least-tested part.
5. **Anything that reads badly.** Wording that is confusing, patronising, or
   just wrong for how people actually talk about open mics.

#### What is already known, no need to report

- iPhone is not supported yet.
- Push notifications may be unreliable on this build.
- Some listings are seeded test data and are not real mics.

#### How to send feedback

Just reply to me directly with whatever you have. Screenshots help a lot.

If something breaks, the three things that make it fixable are:

- **What you tapped** immediately before it happened
- **What you expected** versus what you saw
- **Your phone model** and Android version (Settings, About phone)

A rough note beats a polished one you never send. "The list screen went blank
after I tapped the star" is a perfectly good bug report.
