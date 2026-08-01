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

### 3. Point builds at it

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

### 4. Verify before you build

```bash
npm run check:backend https://<ref>.supabase.co <anon-key>
```

This refuses to pass on the failures that are invisible from the app side: a
loopback URL, a cleartext URL (Android blocks those on device), a rejected
key, missing migrations, a missing EULA row (which strands everyone on the
consent screen), and an empty listings table. Do not build until it prints
`Backend ready`.

### 5. Build

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

### 6. Before sending the link

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
