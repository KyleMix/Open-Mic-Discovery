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
but it is unpleasant to discover
halfway through the Apple form.

So the true order is:

```
Day 1 morning:  request D-U-N-S, put a real page on www.stonedgooseproductions.com
Day 1 afternoon: Supabase project (step 4), Maps key (step 5), verify email (step 3)
Day 1 to 5:     wait on D-U-N-S
D-U-N-S in hand: Apple enrollment (step 1), Play account (step 2), both same day
Day 6 to 9:     wait on Apple and Google identity verification
```

Steps 3, 4, and 5 do not depend on any of it and should be done while you
wait. That is why the numbering below matches the checklist rather than the
calendar.

---

## Step 0: get the D-U-N-S number (do this first, it gates 1 and 2)

A D-U-N-S number is a nine-digit business identifier issued by Dun and
Bradstreet. Apple and Google both use it to confirm that an organization
applying for a developer account is a real registered entity, and both
check what you type against D and B's record rather than against your
paperwork. That is the whole reason the steps below fuss about exact
strings.

### 0a. Check whether you already have one, before requesting anything

Most people skip this and lose a week. D and B assigns numbers on its own,
without anyone asking, when a business shows up in the data it buys: state
registration filings, business credit applications, business bank accounts,
supplier records, insurance. An LLC that has been operating for a while
very often already has one.

Look it up at Apple's tool: https://developer.apple.com/enroll/duns-lookup/

If it finds a match, you are done in five minutes and steps 1 and 2 are
unblocked today rather than next week. Check the returned name and address
carefully against reality. If either is stale, request a correction through
the same tool, because Apple and Google both compare their form fields to
that record and a mismatch stalls enrollment.

### 0b. Get your exact legal name and address first

This is the single most common cause of rejection and delay: the entity
name you type does not match the state registry, character for character.

Washington filings are public. Look yours up at the Secretary of State
Corporations and Charities Filing System:

https://ccfs.sos.wa.gov/#/BusinessSearch

Search the business name, open the record, and copy down exactly:

- The **Business Name** as filed. Note the punctuation and spacing: "Stoned
  Goose Productions LLC" and "Stoned Goose Productions, L.L.C." are
  different strings, and only one of them is yours.
- The **Principal Office Street Address**, exactly as filed.
- The **UBI number** and formation date, which the forms sometimes ask for.

Write these down somewhere you will still have them in a week. You will
retype the same three values into the D and B request, the Apple enrollment
form, and the Google Play organization form, and all four have to agree.

### 0c. Gather the rest before you open the form

The request asks for all of this, and a half-filled form times out:

- Legal entity name and legal structure (Limited Liability Company).
- Physical street address. **Not a PO Box.** D and B routinely rejects PO
  boxes and mailbox services because it is verifying a place of business.
  If the LLC is registered to a home address, use it; that is normal and
  it does not become public on the App Store.
- Mailing address, if it differs.
- A business phone number that a human answers. D and B may call to verify,
  and Apple may call the number on the D and B record during enrollment. An
  unanswered verification call stalls things silently, with no error
  anywhere telling you why.
- Your name and title (Owner, or Managing Member for an LLC).
- Email. Use `kyle@stonedgooseproductions.com` rather than a personal Gmail.
  A company-domain address on a matching company domain is one of the
  signals used to verify you, and a free-mail address can slow it down.
- Company website: `https://www.stonedgooseproductions.com`. Have it
  resolving to something real before you submit, because both D and B and
  Apple look.
- Year the business started.
- Number of employees, including yourself. One is a perfectly normal answer.
- Line of business, in plain words: live comedy event production and a
  mobile application for discovering open mic events.

### 0d. Submit the request

**Route A, Apple's tool (use this one).**
https://developer.apple.com/enroll/duns-lookup/ handles both the lookup and
the request, it is free, and it is the path Apple's own enrollment expects.
Apple states up to five business days; in practice it is often one to three.

**Route B, D and B directly.** https://www.dnb.com/duns/get-a-duns.html
also issues numbers free, but the standard free service can take up to
thirty business days, and the expedited option costs money. There is no
reason to take this route for an App Store enrollment unless Apple's tool
fails for you.

Whichever route, the number arrives by email. Check spam: it comes from a
Dun and Bradstreet domain that has no prior relationship with your inbox.

### 0e. What "done" looks like

You have a nine-digit number, and the D and B record shows your correct
legal name, address, and phone. That last part matters as much as the
number: Google cross-checks the organization details you enter in Play
Console against D and B, so a number attached to a stale address will pass
Apple and then trip Google.

- Cost: free by either route. Time: minutes if one already exists, up to 5
  business days via Apple, up to 30 via D and B's free service.
- Unblocks: steps 1 and 2, completely. Nothing else in this checklist is
  waiting on it, so work steps 3, 4, and 5 while it processes.
- What to keep: the nine digits, plus the exact legal name and address as
  they appear on the D and B record. You will type those into two more
  forms and they must match character for character.

While waiting, put something real at `https://www.stonedgooseproductions.com`:
Apple's organization enrollment asks for a company website and does look at
it.

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

## Step 3: confirm the contact address, and plan the reviewer accounts

Owner decision, 2026-08-08: there is one contact address,
`kyle@stonedgooseproductions.com`, and it is what the app and the EULA name.
No `support@` or `legal@` aliases are being created. The address already
exists and is already in use (the website's open mic sync script identifies
itself with it), so this step is a verification, not a setup.

### Verify the mailbox does both halves

1. Send a message to `kyle@stonedgooseproductions.com` from an outside
   address and confirm it arrives.
2. Reply, and confirm the reply is **from** that address, not from a
   personal Gmail. Apple review does contact the support address, and a
   reply arriving from somewhere else reads as an abandoned listing.

If both hold, this step is done and it cost nothing.

### The part that is easy to miss: the reviewer accounts need real inboxes

Step 4g has you create two reviewer accounts by signing up through the app.
Hosted Supabase enables email confirmation by default, so those two
addresses have to actually receive mail, or the accounts can never be
confirmed and the reviewer credentials you file with Apple will not work.

Use plus addressing on the mailbox you already have, rather than creating
anything:

- `kyle+kyle+reviewer.performer@stonedgooseproductions.com`
- `kyle+kyle+reviewer.producer@stonedgooseproductions.com`

Both deliver to `kyle@`, Google Workspace and Gmail honor the `+` suffix,
and Supabase treats them as distinct accounts. Zero setup, and the
confirmation links land in an inbox you read.

### If you ever want a dedicated support address

It is a two-line change, not a migration of anything: set `SUPPORT_EMAIL`
in `src/lib/support.ts`, and publish a new EULA version for the legal
contact line. The pattern to copy is
`supabase/migrations/20260808000200_eula_web_home.sql`, which changed
exactly those two lines and nothing else.

- Cost: nothing. Time: five minutes to test send and reply.
- Unblocks: the support fields in both store consoles, the in-app contact
  path, the legal contact in the EULA, and confirmable reviewer accounts.

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
   - `kyle+reviewer.performer@stonedgooseproductions.com`
   - `kyle+reviewer.producer@stonedgooseproductions.com`
     Passwords are yours. They go in App Store Connect review notes and your
     password manager.
3. Seed the content those accounts need:

```sh
psql "$PRODUCTION_DATABASE_URL" \
  -v performer_email="'kyle+reviewer.performer@stonedgooseproductions.com'" \
  -v producer_email="'kyle+reviewer.producer@stonedgooseproductions.com'" \
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
