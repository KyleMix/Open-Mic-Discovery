# The first five steps, in detail

The long-form version of steps 1 through 5 of `docs/LAUNCH-CHECKLIST.md`.
The checklist says what to do; this says exactly how, with the values to
have in hand and the traps that waste a day. Written 2026-08-08.

## Read this before starting: the dependency that reorders everything

Both stores now require a **D-U-N-S number** to register as an organization.
Apple has for years; Google Play added it for organization accounts. It is
free, it takes up to five business days, and **one number serves both
stores**. Nothing else in this list is blocked by anything except this.

There is a second, smaller ordering fact: Apple's organization enrollment
asks for a **publicly reachable company website** and will look at it. So
`www.stonedgooseproductions.com` should resolve to something real before you submit the
enrollment form, even if it is one page. That is a few minutes of work
(step 3 sets up the domain anyway) but it is unpleasant to discover
halfway through the Apple form.

So the true order is:

```
Day 1 morning:  request D-U-N-S, put a real page on www.stonedgooseproductions.com
Day 1 afternoon: Supabase project (step 4), Maps key (step 5), email (step 3)
Day 1 to 5:     wait on D-U-N-S
D-U-N-S in hand: Apple enrollment (step 1), Play account (step 2), both same day
Day 6 to 9:     wait on Apple and Google identity verification
```

Steps 3, 4, and 5 do not depend on any of it and should be done while you
wait. That is why the numbering below matches the checklist rather than the
calendar.

---

## Step 0: get the D-U-N-S number (do this first, it gates 1 and 2)

1. Go to https://developer.apple.com/enroll/duns-lookup/.
2. Enter: legal entity name exactly as registered with Washington State
   (`Stoned Goose Productions LLC`), the registered business address, and
   your business phone. Use the exact registered name, including "LLC".
   A mismatch against the state registry is the usual cause of rejection.
3. If the lookup finds an existing D-U-N-S for the LLC, note the number and
   check the listed address and name are current; if they are wrong, use
   the same page to request a correction.
4. If nothing is found, submit the request. Dun and Bradstreet issues it
   free; Apple's page says up to five business days and it usually lands in
   one to three.

- Cost: free. Time: up to 5 business days.
- Unblocks: steps 1 and 2, both of them, completely.
- What to keep: the 9-digit number, plus the exact legal name and address
  as they appear on the D-U-N-S record. You will type those three things
  into two more forms and they must match character for character.

While waiting, put something real at `https://www.stonedgooseproductions.com`: a single
page naming the company and linking to the app is enough for both Apple's
review and your own store listings.

---

## Step 1: Apple Developer Program, as an organization

**Have in hand:** D-U-N-S number, exact legal entity name and address,
business phone that reaches a human, an Apple ID with two-factor
authentication that will be the account holder, a company website URL, and
authority to bind the LLC (Apple asks you to confirm this and may verify).

1. Sign in at https://developer.apple.com/enroll/ with the Apple ID that
   will own the account. Use a company Apple ID, not a personal one you
   might lose access to; the account holder cannot be changed casually
   later.
2. Choose **Company / Organization**, not Individual. This matters beyond
   vanity: an individual account shows your personal legal name as the
   seller on the App Store.
3. Enter the entity details exactly as on the D-U-N-S record.
4. Apple verifies. Expect one of: automatic approval in a day or two, an
   email asking for documentation (formation certificate, business
   license), or a phone call to the number on the D-U-N-S record. Answer
   the phone; an unanswered verification call stalls enrollment silently.
5. When approved, pay the **99 USD per year** membership.
6. Once inside, go to Certificates, Identifiers and Profiles
   (https://developer.apple.com/account/resources/identifiers/list) and
   register the App ID:
   - Bundle ID: `com.openmicexplorer.app` (explicit, not wildcard)
   - Capabilities to tick: **Sign in with Apple** and **Associated
     Domains**. Both are required by this app: Apple sign-in is in
     `src/app/(auth)/sign-in.tsx`, and associated domains are what make
     `www.stonedgooseproductions.com/open-mics/mic/...` open the app.
7. Note your **Team ID** (top right of the developer account page, a
   10-character string).

**What to paste back into the repo:** the Team ID, into
`web/.well-known/apple-app-site-association`, replacing `TODO_TEAM_ID`, so
the file reads `"ABCDE12345.com.openmicexplorer.app"`. Commit it. That file
must be live on the domain before universal links work.

- Cost: 99 USD per year. Time: 1 to 3 days after D-U-N-S, occasionally a week.
- Unblocks: App Store Connect app record, certificates via EAS, TestFlight.

---

## Step 2: Google Play Console, as an organization

**Have in hand:** the same D-U-N-S number, entity name and address, a
Google account for the business (not personal, for the same reason as
Apple), a payment card, and a government ID for the individual completing
verification.

1. Go to https://play.google.com/console/signup.
2. Choose **Organization**. This is the decision that matters most here:
   personal accounts created after November 2023 must run a closed test
   with **12 testers opted in for 14 continuous days** before they can be
   promoted to production. Organization accounts skip that gate entirely.
   Nothing in this repo assumes otherwise. If Google shows you a different
   tester count on the day, believe the console: the number has moved once
   already.
3. Enter the organization details, matching the D-U-N-S record exactly.
   Google cross-checks against D and B.
4. Pay the **25 USD one-time** registration fee.
5. Complete identity and payment verification when prompted. Google will
   ask for the ID document and may ask for proof of address for the
   business. Verification usually clears in one to three days but can take
   longer if the D-U-N-S address is stale, which is why step 0 asked you to
   check it.
6. Once verified, create the app: **All apps, Create app**. App name
   `Open Mic Explorer`, default language English (United States), type App,
   Free.

Do not fill the store listing or Data safety form yet; that is checklist
step 5, and it goes faster once you have screenshots.

- Cost: 25 USD once. Time: 1 to 3 days after D-U-N-S.
- Unblocks: internal testing track, Data safety form, app signing.

---

The app and the EULA now name `support@stonedgooseproductions.com` and
`legal@stonedgooseproductions.com`. Apple review does test the support address, and
"mail delivered but nobody can reply from it" is a real failure mode, so
pick an option that can both receive and send.

**Option A, Google Workspace (recommended if you want it to just work).**
https://workspace.google.com, Business Starter, about 7 USD per user per
month. One user (`kyle@stonedgooseproductions.com`) plus two free aliases
(`support@`, `legal@`) covers this entirely. Aliases cost nothing extra;
you do not need three seats. Setup is a DNS MX record change at your domain
registrar, guided by their wizard, and it is live in under an hour.

**Option B, Cloudflare Email Routing (free, forwarding only).**
If `stonedgooseproductions.com` uses Cloudflare DNS, Email Routing forwards
`support@` and `legal@` to any inbox at no cost. The catch: it forwards
only, it does not send. Replies would come from your personal address,
which looks wrong to a user and to a reviewer. If you take this route, pair
it with Gmail's "Send mail as" using an SMTP relay so replies carry the
right From address.

Whichever you pick:

1. Create or alias `support@stonedgooseproductions.com` and `legal@stonedgooseproductions.com`.
2. Send a test message to each from an outside address and confirm it
   arrives.
3. Reply to each test and confirm the reply comes **from** the right
   address.
4. If you chose an address other than these two, change the one constant
   `SUPPORT_EMAIL` in `src/lib/support.ts` and open a new EULA version for
   the legal address (the pattern is
   `supabase/migrations/20260808000200_eula_web_home.sql`, which changed
   exactly those two lines).

- Cost: 0 to 7 USD per month. Time: under an hour.
- Unblocks: the support fields in both store consoles, the in-app contact
  path, and honest legal contact in the EULA.

---

## Step 4: Supabase production project

This is the longest hands-on step and the one with the most parts. Work
through it in order; several of the later parts fail confusingly if an
earlier one is skipped.

**Have in hand:** the Supabase CLI (`npx supabase --version` works from
this repo), a card, and about two hours.

### 4a. Create the project

1. https://supabase.com/dashboard, New project.
2. Organization: create one named for the LLC.
3. Project name: `open-mic-explorer-prod`.
4. **Region: West US (Oregon)**, closest to a Pacific Northwest user base.
5. **Postgres version: 17.** `supabase/config.toml` pins `major_version =
17` for local; matching production avoids a class of subtle differences.
6. Generate a strong database password and put it in your password manager
   immediately. It is shown once, and `db push` needs it.
7. **Plan: Pro, 25 USD per month.** Not optional in practice: the free tier
   pauses projects after a week of inactivity, and a paused project means a
   reviewer opens the app to a network error. Free tier also has no
   point-in-time recovery, and `delete_account()` is irreversible.

### 4b. Push the schema

From the repo root:

```sh
npx supabase login
npx supabase link --project-ref <your-project-ref>   # asks for the db password
npx supabase db push
```

This applies all **71** migrations in order, ending with
`20260808000200_eula_web_home.sql`. It includes
`20260804000100_discovery_stewardship.sql`, the stewardship migration that
had been deliberately held back: applying the whole chain to a fresh
project is exactly the case where it needs no special handling.

Verify, then regenerate types:

```sh
npx supabase migration list           # every migration shows as applied remotely
npm run db:types                      # regenerates src/types/database.types.ts
npm run typecheck && npm test         # should stay green
git add src/types/database.types.ts && git commit -m "chore: types from the production schema"
```

If `db push` fails partway, read the error before retrying: these
migrations are ordered and several depend on extensions. `pg_cron` and
`pg_net` are available on hosted Supabase but must be enabled under
Database, Extensions if a migration reports them missing.

### 4c. Storage buckets

Under Storage, confirm `avatars` and `posters` exist and are **public**
buckets. The RLS policies for them ship in the migrations; only the buckets
themselves may need creating by hand.

### 4d. Auth configuration

Under Authentication, URL Configuration:

- Site URL: `https://www.stonedgooseproductions.com/open-mics`
- Redirect URLs, add both:
  - `openmicexplorer://auth-callback`
  - `openmicexplorer://reset-password`

Miss the second one and password reset deep links die silently, which is
the kind of thing a reviewer finds and you do not.

Under Authentication, Providers:

- **Apple**: enable. Requires a Services ID and a signing key created in
  the Apple developer account (step 1), under Certificates, Identifiers,
  Keys. Apple sign-in is mandatory here, not optional: the app offers
  Google sign-in, and App Store guideline 4.8 requires an equivalent
  private option alongside it.
- **Google**: enable. Create an OAuth 2.0 client at
  https://console.cloud.google.com/apis/credentials and paste the client ID
  and secret.

Under Authentication, Emails, SMTP Settings: configure a real sender
(Resend, Postmark, and SES all work; Resend's free tier is enough to
start). Without custom SMTP, Supabase's built-in sender is rate limited to
a handful of messages per hour and is documented as development only. Three
flows depend on email and one of them is tested at review time: web account
deletion proves identity by emailed link, and Google Play requires that
path to work.

### 4e. Vault secrets for the push sender

Under Project Settings, Vault, or from the SQL editor:

```sql
select vault.create_secret('https://<ref>.functions.supabase.co/push-sender', 'push_sender_url');
select vault.create_secret('<service role key>', 'push_sender_token');
```

The pg_cron job created by `20260803000700_push_sender_schedule.sql` reads
these every minute. Without them the job returns early and no push
notification is ever delivered, quietly.

### 4f. Deploy the edge functions

```sh
npx supabase functions deploy deletion-request
npx supabase functions deploy push-sender
npx supabase secrets set ALLOWED_ORIGIN=https://www.stonedgooseproductions.com
npx supabase secrets set DELETE_PAGE_URL=https://www.stonedgooseproductions.com/open-mics/delete-account/
npx supabase secrets set RATE_LIMIT_SALT=$(openssl rand -hex 32)
```

Prove the deletion endpoint answers, which is the check that catches a
half-finished setup:

```sh
curl -sS -X POST "https://<ref>.supabase.co/functions/v1/deletion-request" \
  -H 'content-type: application/json' -d '{}'
```

A correct deployment answers `400 {"error":"Unknown action."}`. A 404 or an
HTML page means the deploy or the secrets are incomplete.

### 4g. Reviewer accounts and content

Order matters here, and the reason is in
`supabase/seed/production-reviewer-seed.sql`: **do not run
`supabase/seed.sql` against production.** Its passwords are published in
this repository and it writes two rows into the admin allowlist.

1. Wire the EAS environment variables and make a preview build pointed at
   production (checklist step 6), or run the app locally against the
   production URL for this one purpose.
2. In the app, sign up **two accounts** and finish onboarding for each,
   choosing the performer role for one and producer for the other:
   - `reviewer.performer@stonedgooseproductions.com`
   - `reviewer.producer@stonedgooseproductions.com`
     Passwords are yours. They go in App Store Connect review notes and your
     password manager.
3. Seed the content those accounts need:

```sh
psql "$PRODUCTION_DATABASE_URL" \
  -v performer_email="'reviewer.performer@stonedgooseproductions.com'" \
  -v producer_email="'reviewer.producer@stonedgooseproductions.com'" \
  -f supabase/seed/production-reviewer-seed.sql
```

It creates 8 venues and 10 listings covering music, comedy, and poetry
and all four signup methods, four of them owned by the reviewer producer
so the producer side has something to manage. It refuses to run if
either account is missing, never touches the admin allowlist, and is
safe to run twice.

4. Confirm the nights generated, because nights are what a reviewer
   actually sees:

```sql
select count(*) from mic_occurrences o
  join mic_series s on s.id = o.series_id
 where s.id::text like '5eed%' and o.starts_at > now();
```

Roughly 100 on a fresh run. Zero means
`private.generate_occurrences()` has not fired; run it once by hand.

5. Update the demo credentials table in `REVIEW_NOTES.md` with the two real
   addresses, replacing the local-only demo rows.

### 4h. Make yourself a moderator

Per `docs/admin/RUNBOOK.md`, from the SQL editor. Note the runbook's warning
that the editor has no session, so every admin function needs the JWT claim
set in the same run.

Then enable backups and point-in-time recovery under Project Settings,
Database. `delete_account()` is irreversible and this is the only thing
standing behind it.

- Cost: 25 USD per month, plus SMTP if the free tier is outgrown.
- Time: about two hours of hands-on work.
- Unblocks: every build that talks to production, and store submission.

---

## Step 5: restrict the Google Maps Android key

The key currently in `app.json` (`android.config.googleMaps.apiKey`,
starting `AIzaSyAgeA`) ships inside every Android binary by design, and it
is in this repository's git history. That is normal for Maps SDK for
Android keys and is not a leak in the service-role sense, but an
**unrestricted** key can be lifted from the APK and billed to you. iOS is
unaffected: this app uses Apple Maps on iOS and has no iOS Maps key.

Restricting needs certificate fingerprints, so this is best done after step
2 gives you a Play Console, though you can restrict to the upload key now
and add the app-signing key later.

1. Get the fingerprints:
   - Upload key: run `npx eas credentials`, choose Android, production, and
     read the **SHA-1** and **SHA-256** of the keystore EAS holds.
   - App signing key: Play Console, your app, Test and release, Setup, App
     integrity, App signing tab. Copy the **SHA-1** and **SHA-256** there.
     This one only exists after you have uploaded a first build, so expect
     to come back.
2. Go to https://console.cloud.google.com/apis/credentials, in the project
   that owns the key.
3. Click the key, then:
   - **Application restrictions**: Android apps. Add an item for package
     name `com.openmicexplorer.app` with the upload key SHA-1, and a second
     item with the same package and the app signing key SHA-1. Both are
     needed: builds you install directly are signed with the upload key,
     builds from Play are re-signed with the app signing key, and a key
     restricted to only one of them shows a blank grey map in the other.
   - **API restrictions**: Restrict key, then select **Maps SDK for
     Android** only.
4. Save, and give it up to five minutes to propagate.
5. Under Billing and under APIs and Services, Quotas, set a low daily quota
   cap on Maps SDK for Android. Restriction stops theft; a quota cap stops
   a runaway bill from a bug.

**If the key was ever used unrestricted in a public build**, prefer
rotating: create a new key with the restrictions above, replace the value
in `app.json`, commit, and delete the old key. Rewriting git history is not
worth it; the old key becomes worthless once deleted.

While you are in this console, the same fingerprints feed
`web/.well-known/assetlinks.json`: paste the **SHA-256** values (both keys)
into `sha256_cert_fingerprints`, replacing `TODO_SHA256_CERT_FINGERPRINT`.
That file plus the Team ID from step 1 are what make deep links verify.

- Cost: free at this usage. Time: 15 minutes, plus a return trip after the
  first Play upload.
- Unblocks: Android maps that keep working, and a bill that stays at zero.

---

## What you should have when these five are done

- A D-U-N-S number, and both store accounts verified as
  Stoned Goose Productions LLC.
- Team ID in `apple-app-site-association`, SHA-256 fingerprints in
  `assetlinks.json`, both committed.
- Working `support@` and `legal@` mailboxes.
- A production Supabase project with 71 migrations applied, buckets, auth
  providers, custom SMTP, vault secrets, both edge functions live, two
  reviewer accounts, seeded content with about 100 upcoming nights, your
  moderator access, and backups on.
- A restricted, quota-capped Maps key.

Next up in `docs/LAUNCH-CHECKLIST.md`: step 6 (EAS environment variables
and credentials), step 7 (host the web pieces), step 9 (Sentry), then
step 10 builds and submits.
