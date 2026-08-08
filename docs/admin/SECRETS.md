# SECRETS: where each one lives, and how it rotates

Requirement S13. Every secret this project uses, where it is stored, who can read
it, and what to do when it has to change. Compiled from the code rather than from
memory: each entry names the file or function that reads it.

Date: 2026-08-07.

## The rule

**No secret is ever committed.** `.env` is gitignored and `.env.example`
documents only the shape. `app.json` and `eas.json` carry no values. The one
thing that ships inside the app binary is the anon key, which is public by design
(see below).

**Separate values per environment.** Local, staging and production are separate
Supabase projects with separate key sets. Nothing is shared between them, which is
what makes a leak in one survivable. Note the gap honestly: **there is no staging
project today.** Local and production exist. Creating staging is outstanding work,
and until it does, "test it first" means testing locally.

---

## 1. Client-visible values

These are compiled into the mobile app. Anyone can extract them from a build. They
are not secrets and are listed so nobody treats them as ones.

| Value                            | Where it lives                                            | Read by                                 |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`       | EAS environment variables per environment; `.env` locally | `src/lib/env.ts`                        |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`  | same                                                      | `src/lib/env.ts`, `src/lib/supabase.ts` |
| `EXPO_PUBLIC_SENTRY_DSN`         | same, optional. Sentry is inert when unset                | `src/lib/sentry.ts`                     |
| `EXPO_PUBLIC_AGE_SIGNAL_ENABLED` | same, optional flag                                       | `src/features/auth/ageSignal.ts`        |

**Rotating the anon key is disruptive and almost never right.** It is in every
installed build, so a rotation locks out every user who has not updated. It grants
only what row level security allows an anonymous or signed-in caller, which is
what any user already has. If it appears in a paste or a screenshot, that is not
an incident.

Set them with:

```
npx eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
```

Locally, `npm run dev:env` writes them into `.env` by reading the running Supabase
stack, which is safer than copying by hand: `supabase start` mints a fresh anon
key every time the stack is recreated.

---

## 2. The service role key

**The one that matters.** It bypasses row level security completely. Treat any
exposure as a full database compromise and follow section 3 of the RUNBOOK.

| Held in                                          | Read by                                                                                                                      | Rotate by                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Supabase dashboard, Project Settings, API        | the source of truth                                                                                                          | regenerate there                                         |
| Edge Function secret `SUPABASE_SERVICE_ROLE_KEY` | `supabase/functions/push-sender/index.ts` compares the request's `Authorization` header against it                           | `npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` |
| Edge Function environment (same variable)        | `supabase/functions/deletion-request/index.ts`, for `delete_account_web`                                                     | same                                                     |
| Vault secret `push_sender_key`                   | `private.drain_notification_outbox()`, the live drain, run every minute by pg_cron                                           | `select vault.update_secret(...)`                        |
| Vault secret `push_sender_token`                 | `private.invoke_push_sender()`, **not currently scheduled** (`20260806000200` unscheduled it in favour of the batched drain) | same, or delete the secret                               |

Two Vault entries holding the same key under different names is a leftover from
the change of drain design. Rotating one and not the other leaves a landmine for
whoever reschedules the older job. Either rotate both or remove
`push_sender_token` and `private.invoke_push_sender()` together, deliberately.

It never reaches a client: nothing under `src/` reads it, and the console (when it
exists) must keep it server side. S1 requires a build step that greps the built
output for key prefixes and fails on a hit. **That build step does not exist
yet**, in either repo.

---

## 3. Edge Function configuration

| Name              | Function           | Secret?     | Notes                                                                                                                                                                                                                                         |
| ----------------- | ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RATE_LIMIT_SALT` | `deletion-request` | yes, mildly | Salts the hashes of email and IP used as rate limit keys, so stored keys cannot be reversed to addresses. Rotating it resets the current windows, which is harmless. Defaults to a literal in code if unset, which is weaker than setting it. |
| `ALLOWED_ORIGIN`  | `deletion-request` | no          | CORS origin for the deletion page. Configuration.                                                                                                                                                                                             |
| `DELETE_PAGE_URL` | `deletion-request` | no          | Where the magic link returns to. Configuration.                                                                                                                                                                                               |

`deletion-request` runs with `verify_jwt = false` on purpose: the page has no
session. Its protection is the magic-link round trip plus rate limiting, not a
token.

---

## 4. Auth provider secrets

Set as project secrets, referenced from `supabase/config.toml` via `env(...)` so
no value is committed.

| Name                                                     | Used for                               |
| -------------------------------------------------------- | -------------------------------------- |
| `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID` / `..._SECRET`  | Sign in with Apple                     |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `..._SECRET` | Google sign-in                         |
| `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`                    | only if SMS is ever enabled; it is off |

Apple's client secret is a signed JWT with an expiry, so it needs re-minting on a
schedule rather than only after an incident. Whoever holds the Apple Developer
account owns that.

---

## 5. Things that are not secrets but look like them

- **The test kit password.** `private.test_kit_password()` returns a literal
  written down in a migration and documented in `docs/TEST_KIT.md`. It is not a
  secret and must never guard anything real. What protects the kit is
  `private.is_admin()` plus the `test_kit_settings.enabled` kill switch, which
  ships **off** since `20260807000400`. If that switch is on in production and you
  did not turn it on, treat it as an incident: the kit mints `auth.users` rows.
- **The owner email allowlist.** `private.owner_emails()` is a hard-coded array in
  a migration. Public knowledge. It grants nothing without control of the mailbox
  and a confirmed address.
- **Invite tokens.** `admin_invite` returns one raw token, once. Only its SHA-256
  hash is stored, so the database cannot give it back and a database leak yields
  no usable invitation. They expire in 72 hours by default and are single use.

---

## 6. Rotation procedure

For anything in section 2, 3 or 4:

1. **Generate the new value** at the source (Supabase dashboard, Apple, Google).
2. **Write it everywhere at once**, using the table above as the checklist. Every
   incomplete rotation this project can suffer is a partial one.
3. **Verify** before walking away:
   - service role key: `select count(*) from notification_outbox where sent_at is null;`
     should stop growing within a couple of minutes;
   - deletion path: request a deletion link for a test address on the live page
     and confirm the mail arrives;
   - OAuth: sign in with that provider on a build.
4. **Invalidate the old value** where that is a separate step (Supabase key
   regeneration is immediate; OAuth secrets usually need explicit revocation).
5. **Write down what you rotated and when.** There is no automated record: the
   audit log covers moderator actions, not infrastructure. A dated line in this
   file's history is the record.

---

## 7. What is still missing

Named so it is not mistaken for done.

- **A staging Supabase project.** S13 asks for separate keys per environment and
  there are two environments, not three.
- **The S1 build check.** No step in either repo greps a built bundle for key
  prefixes and fails the build.
- **Console secrets.** The console does not exist. When it does it will need its
  own entries here: its Supabase keys per environment, the Cloudflare Access
  configuration, and whatever signs its session cookies.
- **A secret manager.** Values live in the Supabase dashboard, EAS, and Postgres
  Vault. That is three places and no single inventory except this file, which is
  maintained by hand and will drift unless it is updated in the same commit as any
  change.
