# RUNBOOK: operating the moderation controls

Procedures for the things that go wrong. Every SQL block here was executed
against a database built from the current migration set before it was written
down, because a runbook full of untested commands is worse than no runbook: it
gets trusted at two in the morning and then it fails.

Date: 2026-08-07. Migration head: `20260807001600_pii_masking_and_audited_reveal.sql`.

## Read this first: there is no console yet

The moderation console is not built. Everything below is done either from the
Supabase SQL editor or from the in-app moderation screen (`/admin`, linked from
the Profile tab for accounts carrying `is_admin`). When the console ships, most
of these become buttons and this document becomes the fallback rather than the
procedure.

**The SQL editor has no session, and every admin function needs one.** The
functions read `auth.uid()` to decide who is acting and to stamp the audit log,
and the SQL editor connects as the database superuser with no JWT. So every
procedure that calls one of these functions starts by declaring who you are:

```sql
select set_config('request.jwt.claims',
  '{"sub":"<your-profile-uuid>","role":"authenticated"}', true);
```

That setting is transaction-local, so it has to be in the **same editor run** as
the call that follows it. Verified: without it, `admin_invite` refuses with
`only an owner can manage admins`.

Find your own uuid with `select id from profiles where handle = '<your handle>';`.

---

## 1. Onboard an admin

Two steps, and the second one is theirs, not yours.

```sql
select set_config('request.jwt.claims',
  '{"sub":"<your-uuid>","role":"authenticated"}', true);

select admin_invite(
  'them@example.com',        -- must match the address on their account
  'moderator',               -- owner | moderator | read_only
  'Covering the Thursday queue while I am away.',
  '<your ip>'::inet          -- pass null only if there is no request behind this
);
```

That returns a token, once. It is not stored and cannot be recovered: only its
SHA-256 hash is kept. Send it to them over something you trust.

They then sign in to the app with that email address, confirm it if they have not
already, and redeem the token:

```sql
select admin_invite_accept('<the token>');
```

Returns the role they landed at. The token is single use.

**Which role.** `owner` can do everything including managing admins. `moderator`
moderates and cannot touch the allowlist or settings. `read_only` sees the queue
and writes nothing anywhere: not a report resolution, not a moderation decision,
not a sanction, and no RPC. Give `read_only` to somebody who needs to look, and
note that they cannot unmask a contact detail either.

**Invitations expire** after 72 hours by default. Pass a fifth argument to change
that (`interval '7 days'`). One live invitation per address: a second is refused
rather than issuing two working tokens.

To withdraw one before it is used:

```sql
select admin_invite_revoke('<invite-id>', 'Hired someone else.', '<ip>'::inet);
-- find it: select id, email, role, expires_at from admin.admin_invites
--            where consumed_at is null and revoked_at is null;
```

---

## 2. Revoke an admin immediately

This is the emergency one, so it comes with what it does and does not stop.

```sql
select set_config('request.jwt.claims',
  '{"sub":"<your-uuid>","role":"authenticated"}', true);

select admin_set_active('<their-uuid>', false,
  'Suspected account compromise, revoking pending investigation.',
  '<your ip>'::inet);
```

**This takes effect immediately, including for a session they already hold.**
Verified: a moderator with a valid JWT, revoked mid-session, drops to
`is_admin_reader = false`, `is_admin = false`, zero rows from the report queue and
zero from `admin_profile_review`. Nothing waits for their token to expire.

The reason that works is worth understanding, because it changes when the access
token hook lands: their role is **not** in the JWT today. Every policy asks the
allowlist through a function at query time. Once the custom access token hook
exists (S4), the role will be a claim baked into a token valid for up to an hour,
and revocation will stop being instant. When that migration lands, this procedure
needs a second step: sign their sessions out through the Supabase admin API. Do
not delete that paragraph when the hook ships.

**It does not** delete their account, remove their content, or stop them using
the app as an ordinary user. If they need to be stopped as a user too, that is a
sanction, section 4.

**It does not** work on yourself. `admin_set_active` refuses when the target is
the caller, which is also what guarantees the last active owner cannot be
removed: only an owner can run it, and they cannot aim it at themselves.

Reversing it is the same call with `true`.

### If you have locked yourself out

Two routes, in order of preference.

1. **The owner bootstrap.** Signing in on an address in
   `private.owner_emails()` with a confirmed email re-grants owner on profile
   creation, and seeds the allowlist row. That is the designed way back in.
2. **Direct repair as the database superuser**, from the SQL editor:

   ```sql
   insert into admin.admin_users (user_id, role, active)
   values ('<your-uuid>', 'owner', true)
   on conflict (user_id) do update set role = 'owner', active = true;
   ```

   Verified: the trigger mirrors this into `profiles.is_admin` in the same
   statement, so policies start granting immediately. This bypasses the audit log
   entirely, which is exactly why it is route two. Write down that you did it and
   why.

---

## 2a. Turn on two factor enforcement

**This is outstanding work, not a procedure for an emergency.** The machinery
landed in `20260807001700` switched off, because requiring AAL2 before anybody has
enrolled a factor locks out every admin at once. Until the flag is on, S3 and S8
are built and not in force. Do this once, in this order.

**Step 1. Switch TOTP on for the hosted project.** Supabase dashboard,
Authentication. `supabase/config.toml` covers the local stack only, so editing it
proves nothing about production. The project is on the Pro plan, which is where
Supabase puts MFA.

**Step 2. Enrol a factor on the owner account, and verify it.** An authenticator
app on a phone you will still have next year. Do this before step 4, and keep the
recovery arrangements somewhere that is not the same phone.

**Step 3. Enrol every other admin.** Anyone without a factor loses access the
moment step 4 runs. Check who that is:

```sql
select a.role, a.user_id, p.handle
  from admin.admin_users a
  join profiles p on p.id = a.user_id
 where a.active;
```

**Step 4. Flip the switch.**

```sql
update admin.security_settings set require_aal2 = true, updated_at = now();
```

**Step 5. Confirm, from a real session rather than from SQL.** Sign in to the app
as the owner without completing the MFA challenge and confirm the moderation
screen shows nothing. Complete the challenge and confirm it fills in again.

### If that locks you out

One statement, as the database superuser from the SQL editor:

```sql
update admin.security_settings set require_aal2 = false, updated_at = now();
```

Access returns immediately, with no session to re-establish and no token to wait
out. That escape is why the flag is a table row rather than something compiled in,
and it is verified by an assertion in `supabase/tests/aal2-step-up.test.sql`.

### What each of the two gates does once it is on

- **AAL2 (S3).** Folded into `private.is_admin()` and
  `private.is_admin_reader()`, so all 29 admin policies inherit it with no policy
  of their own to check. An AAL1 admin session reads what a stranger reads and
  writes what a stranger writes: nothing. It reaches further than the console:
  `moderate_content` asks the same predicate, so the in-app moderation screen also
  needs a completed challenge.
- **Step-up (S8).** A fresh challenge within five minutes, required for applying
  a suspension or a ban and for anything that changes who can reach the console.
  A warning does not need one, because making the cheapest action the most
  annoying is how people stop warning anybody. The window is hard-coded in
  `admin.step_up_window()` rather than being a setting, since a configurable
  security window only ever gets turned one way.

One assumption in this chain could not be tested from a development environment:
the exact `method` string Supabase writes into the `amr` claim after a TOTP
challenge. `admin.mfa_methods()` holds the accepted set (`totp`, `mfa/totp`) in
one place for that reason. **Step 5 is what proves it.** If a fresh challenge
still fails step-up, that function is the one edit needed.

---

## 3. If a key leaks

Which key it is changes everything, so identify it first.

### The anon / publishable key (`EXPO_PUBLIC_SUPABASE_ANON_KEY`)

**This is not an incident.** It ships in every copy of the mobile app and is
designed to be public. It grants exactly what row level security allows an
anonymous or signed-in user, which is what any user already has. Do not rotate it
in a panic: rotating it bricks every installed build until they update.

### The service role key

**This is a full compromise of the database.** It bypasses row level security
entirely. Act in this order:

1. Rotate it in the Supabase dashboard (Project Settings, API). This invalidates
   the old key immediately.
2. Update every place that holds it. As of today that is four places, and one of
   them is easy to miss:

   - the `push-sender` Edge Function's own `SUPABASE_SERVICE_ROLE_KEY` secret,
     which it compares the incoming `Authorization` header against;
   - the `deletion-request` Edge Function, which uses the service role to call
     `delete_account_web`;
   - the Vault secret **`push_sender_key`**, read by
     `private.drain_notification_outbox()`. This is the live drain: pg_cron runs
     it every minute, and `20260806000200` unscheduled the older `push-sender`
     job in favour of it;
   - the Vault secret **`push_sender_token`**, read by
     `private.invoke_push_sender()`. That function is no longer scheduled, so a
     stale value here breaks nothing today, but it will bite whoever reschedules
     it. Two Vault secrets holding the same key under different names is a trap
     left by the change of drain design; rotate both or delete the unused one.

   What a stale Vault key looks like, so it is recognisable: the drain still runs
   every minute and `push-sender` rejects it with 403, so outbox rows sit with
   `sent_at` null and nobody gets a notification. A _missing_ Vault secret is
   louder, because `drain_notification_outbox` raises rather than returning
   quietly. Check with
   `select count(*) from notification_outbox where sent_at is null;`.

3. Read the audit log for the exposure window (section 5). Note its limit
   honestly: a service-role actor with no session **cannot write to the audit
   log** (`admin.append_audit` refuses without `auth.uid()`), so an attacker
   holding this key leaves no trace there. The Supabase platform logs are the
   evidence, not this table.
4. Check `admin.admin_users` for rows you did not create, and
   `admin.admin_invites` for live invitations you did not issue. A service-role
   holder can write both directly.
5. Check `test_kit_settings.enabled`. If it is `true` and you did not switch it
   on, assume accounts were minted: the kit creates `auth.users` rows with a
   password written down in a migration.

### The owner account password

Reset it, then check `admin.admin_users` for anything added while it was out of
your hands, and the audit log for `admin.invite`, `admin.set_role` and
`admin.deactivate` entries you did not make.

### Other secrets that exist today

`RATE_LIMIT_SALT` (deletion-request; rotating it resets the rate limit windows,
which is harmless), `ALLOWED_ORIGIN` and `DELETE_PAGE_URL` (configuration, not
secrets), Apple and Google OAuth client secrets, and the Twilio auth token if SMS
is ever enabled. `docs/admin/SECRETS.md` is where each one lives and how it
rotates.

---

## 4. Undo a moderation action

Everything a moderator can do is reversible, and the reversal is itself recorded.

### A listing, venue, profile or credit rejected by mistake

```sql
select set_config('request.jwt.claims',
  '{"sub":"<your-uuid>","role":"authenticated"}', true);
select moderate_content('venue', '<target-id>', true);   -- true = approve
```

Verified: a rejection followed by a re-approval leaves the row `approved`.
Targets are `profile`, `venue`, `series` and `credit`.

Note the gap: `moderate_content` predates the audit log and takes no reason, so
these decisions are **not** recorded anywhere. Until the console's own RPCs land,
if a decision is contentious write it down yourself.

### A sanction applied wrongly

```sql
select admin_sanction_lift('<sanction-id>',
  'Appeal upheld: the reports came from one person using three handles.',
  '<your ip>'::inet);
-- find it: select id, user_id, type, scope, reason, created_at
--            from user_sanctions where lifted_at is null;
```

Lifting a **ban** also switches its listings back on, and only the ones the ban
switched off: anything the producer had already paused stays paused, because the
ids were recorded when the ban was applied. A sanction can only be lifted once.

The lift appends a reversal entry pointing at the entry that recorded the
sanction, so "who lifted this and why" is answerable from the log with no second
table.

### An account banned that should not have been

Lift the sanction as above. The account resolves publicly again immediately, its
listings come back, and it can sign up, post and report as before.

### Something that cannot be undone

Nothing in the console hard-deletes, so this list is short and it is about things
outside it. Rejected avatars and posters stay fetchable by URL because both
storage buckets are public: hiding an image from the app is not removing it, and
removal is a Storage API delete, which is permanent. Permanent deletion of
anything else happens outside this tooling, deliberately, and should be written
down when it happens.

---

## 5. Read the audit log

`admin.audit_log` is append only and cannot be edited or deleted by anyone,
including the table owner: two triggers refuse `UPDATE`, `DELETE` and `TRUNCATE`.
It is not exposed through the Data API, so it is read from the SQL editor or with
the service role.

```sql
select to_char(occurred_at, 'YYYY-MM-DD HH24:MI') as when,
       actor_role, action, target_type, target_id,
       reason, request_ip, reversible
  from admin.audit_log
 order by id desc
 limit 50;
```

Verified output shape:

```
       when       | actor_role |   action   | target_type |     reason     | request_ip  | reversible
 2026-08-08 15:15 | moderator  | pii.reveal | profile     | Runbook check. | 203.0.113.7 | f
```

By actor: `where actor_id = '<uuid>'`. By subject:
`where target_type = 'profile' and target_id = '<uuid>'`. Reversals:
`where reverses_id is not null`.

What is in there today: `admin.invite`, `admin.invite_accept`,
`admin.invite_revoke`, `admin.set_role`, `admin.deactivate`, `admin.reactivate`,
`user.warn`, `user.suspend`, `user.ban`, `user.sanction_lift`, `pii.reveal`.

What is **not** in there, so you do not go looking: anything done through the
in-app moderation screen. `moderate_content`, `resolve_flag` and the direct
`reports` update all predate the log and take no reason. That is the status quo
rather than a regression, and it closes when the console's RPCs replace them.

A `pii.reveal` entry records which field was unmasked and never the value,
because every admin can read this log.

---

## 6. Who to contact

- **Product and database owner:** Kyle Mixon, `kylewmixon@gmail.com`. The only
  address in `private.owner_emails()`, so it is also the account that can always
  get back in.
- **User-facing support:** the constant `SUPPORT_EMAIL` in `src/lib/support.ts`,
  currently the placeholder `support@openmicfinder.app`. Still an open decision
  (`DECISIONS_NEEDED.md` item 11): the real address and who reads it.
- **Supabase:** dashboard support for the project. Needed for key rotation,
  session revocation through the admin API, and platform logs.
- **Legal or law-enforcement requests:** no procedure exists. If one arrives,
  stop and get advice before touching data; note that account deletion is
  irreversible and that `admin.audit_log` cannot be edited to remove anything.

---

## Appendix: what each control actually enforces

Useful when deciding which lever to pull.

| You want to                      | Use                                             | Reversible                          | Audited |
| -------------------------------- | ----------------------------------------------- | ----------------------------------- | ------- |
| Stop someone using the console   | `admin_set_active(..., false, ...)`             | yes                                 | yes     |
| Change what an admin can do      | `admin_set_role`                                | yes                                 | yes     |
| Add an admin                     | `admin_invite` then their `admin_invite_accept` | via `admin_set_active`              | yes     |
| Warn a user                      | `admin_sanction_apply(..., 'warned', ...)`      | yes                                 | yes     |
| Stop a user acting, temporarily  | `..., 'suspended', ...` with an end date        | yes                                 | yes     |
| Stop a user acting, indefinitely | `..., 'banned', ...`                            | yes, and it restores their listings | yes     |
| Hide or restore content          | `moderate_content`                              | yes                                 | **no**  |
| Act on a data-quality flag       | `resolve_flag`                                  | no                                  | **no**  |
| See a contact detail             | `admin_reveal`                                  | n/a                                 | yes     |
| Resolve a report                 | in-app screen, or a direct `reports` update     | yes                                 | **no**  |

The three unaudited rows are the same gap from three angles, and they close
together when the console's mutations replace those paths.
