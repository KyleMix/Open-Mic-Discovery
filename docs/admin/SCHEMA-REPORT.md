# SCHEMA REPORT: what the Open Mic Explorer backend looks like today

Phase 0 of the moderation console brief. Read only. No code was written, no
migration was added, nothing was scaffolded.

Method: every file in `supabase/migrations` (61 up migrations, 8 down
migrations), `supabase/config.toml`, both Edge Functions, and the app code that
touches moderation. Policies are quoted in their **effective final form**: where
a later migration dropped and recreated a policy, the later text is what appears
here, with the earlier version noted. `20260801000500_rls_initplan.sql` rewrote
23 policies to wrap helper calls in a scalar subquery, so most admin policies
below read `(select private.is_admin())` rather than the original bare call. That
migration changed performance only, not who can see what.

Date of report: 2026-08-07. Migration head: `20260807000900_credit_moderation.sql`.

---

## 1. Headline findings, before the detail

Six things matter more than the rest for this project.

**F-A. There is exactly one privilege bit, and it is a boolean on a table row.**
`profiles.is_admin`. There is no role tier, no `owner` versus `moderator` versus
`read_only`, and no separate admin identity. Every admin policy and every
moderator RPC in the database asks the same question: `private.is_admin()`.

**F-B. An existing admin can promote anyone, including through the public REST
API.** The policy `profiles admin update` is `for update to authenticated using
((select private.is_admin()))` with no `WITH CHECK` clause, so the `USING`
expression serves as the check. `private.guard_profile_writes()` pins `is_admin`
to its old value only `if auth.uid() is not null and not private.is_admin()`. For
a caller who is already an admin the guard does nothing at all. So any admin can
`PATCH /rest/v1/profiles?id=eq.<victim>` with `{"is_admin": true}` and mint
another admin, with no audit trail, from a phone. This is the single largest gap
against S4 and S5 and it needs a migration whatever else the console does.

**F-C. The blanket grants in `20260728001200_grants.sql` will silently arm every
new admin table and every new admin RPC for `anon`.** That migration runs
`grant all on all tables in schema public to anon, authenticated, service_role`
and then, worse for us, `alter default privileges in schema public grant all on
tables to anon, authenticated, service_role` plus `grant execute on functions`.
Default privileges apply to objects created by later migrations. So an
`audit_log` table created in `public` arrives with `INSERT, UPDATE, DELETE`
granted to `anon`, and a new `SECURITY DEFINER` admin RPC arrives executable by
`anon`. RLS is the only thing standing behind that today. S6 forbids the grant
existing at all, not just being unreachable. Every admin object therefore either
lives outside `public` or carries explicit revokes in the same migration.

**F-D. There is no ban, no suspension, no warning, and no appeal.** Nothing in
the schema can stop a specific account from using the app. `blocks` is
user-to-user and only filters visibility. The only enforcement that exists is
content-level: `moderation_status = 'rejected'` hides a listing, a venue, a
profile, or a credit from the public views. A person whose content is rejected
can immediately post more.

**F-E. The report table already exists and is called `reports`, not
`content_reports`.** It carries reporter, polymorphic target, reason enum, free
text, status enum, resolver, and timestamps. It is missing severity, assignee,
and a resolution note. The brief's `content_reports` proposal would duplicate a
live table that the mobile app already writes to from two screens. Extend, do not
add.

**F-F. Session policy and MFA are project-wide settings on a project the mobile
app shares.** S3 (mandatory TOTP), S9 (thirty minute idle, eight hour absolute),
and S2 (no self signup) are, in Supabase, properties of the Auth service, not of
a client. Setting a thirty minute inactivity timeout to satisfy S9 logs mobile
users out every thirty minutes. Turning off signup to satisfy S2 breaks the app
entirely. Every one of those three has to be enforced at the console boundary
instead, in middleware and in policy predicates, and S9's numbers cannot be met
by Auth configuration at all without harming the app. Detail in section 8.

---

## 2. Tables: RLS status and every policy verbatim

24 tables exist. **All 24 have `enable row level security`.** No table is
missing it. `force row level security` is not used anywhere, which matters only
for the table owner and the `postgres` role, not for API roles.

Two tables have RLS enabled with **no policies at all**, which is a deliberate
default-deny: `notification_outbox` and `private.rate_limit_counters`. Both are
service-role only.

### 2.1 `eula_versions`

```sql
alter table eula_versions enable row level security;
create policy "eula readable by everyone" on eula_versions
  for select to anon, authenticated using (true);
-- No insert/update/delete policies: EULA versions land via migrations only.
```

Reading: world readable, immutable through the API. EULA text ships in
migrations. Correct. Three versions exist (1.0, 1.1, 1.2); older ones are
retained because `profiles.eula_version` is a foreign key to this table.

### 2.2 `profiles`

Columns of interest: `is_performer`, `is_producer`, `is_admin`, `moderation_status`,
`deleted_at`, and the private ones `birth_year`, `home_location`, `home_city`,
`display_name`.

```sql
alter table profiles enable row level security;

create policy "profiles owner select" on profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles owner insert" on profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles owner update" on profiles
  for update to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));
create policy "profiles admin select" on profiles
  for select to authenticated using ((select private.is_admin()));
create policy "profiles admin update" on profiles
  for update to authenticated using ((select private.is_admin()));
-- No delete policy: account deletion is a service-role flow.
```

Reading: a signed-in user reads and writes only their own row, and cannot write
it after it is soft-deleted. An admin reads every row and writes every row.
`anon` gets nothing. Non-owners read through `public_profiles`, because RLS
cannot hide columns and `birth_year` and `home_location` must not leak.

The admin update policy is the F-B hole: no `WITH CHECK`, no column restriction,
so it authorizes changing `is_admin`, `moderation_status`, `birth_year`,
`home_location`, `handle`, anything, on anyone, through plain REST.

Field integrity is enforced by triggers rather than policy. `profiles_guard`
(`private.guard_profile_writes`, final form in `20260728001000_moderation.sql`)
runs `BEFORE INSERT OR UPDATE` and, **only for non-admins**:

- `INSERT`: forces `is_admin := false`, stamps `eula_accepted_at := now()`, and
  sets `moderation_status` from the banned-term filter.
- `UPDATE`: restores `old.is_admin`, reverts any client attempt to change
  `moderation_status`, re-stamps `eula_accepted_at` only when `eula_version`
  actually changed, and re-runs the filter when `display_name`, `bio`, or
  `handle` changed.

Then `profiles_owner_bootstrap` (`private.bootstrap_owner_profile`, final form
in `20260807000400_test_kit_off_by_default.sql`) runs after it, by trigger name
sort order, and puts `is_admin := true` back for the single hard-coded owner
email, but only when `auth.users.email_confirmed_at is not null`. Two other
triggers: `profiles_age_gate` rejects a missing or under-18 `birth_year` for
end-user writes, and `profiles_sync_home_location` derives the geography point
from the city.

### 2.3 `performer_profiles`

```sql
alter table performer_profiles enable row level security;
create policy "performer profile owner all" on performer_profiles
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
```

Reading: owner only, all four verbs. **There is no admin policy here.** An admin
cannot read a performer's disciplines, experience, links, or tags through the
table. The public subset is `performer_public`. Worth knowing before the console
promises "view a user with full context".

### 2.4 `producer_profiles`

Holds `contact_email`, `contact_phone`, `payout_ref`, `verified`.

```sql
alter table producer_profiles enable row level security;
create policy "producer profile owner all" on producer_profiles
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
create policy "producer profile admin select" on producer_profiles
  for select to authenticated using ((select private.is_admin()));
```

Reading: owner does everything; admin reads, and cannot write. So an admin can
already see a producer's phone number and email with no reason string and no
audit row. That is the single largest S12 gap in the existing schema.
`producer_profiles_guard` pins `verified` to its old value for non-admins.

### 2.5 `venues`

```sql
alter table venues enable row level security;
create policy "venues public select" on venues
  for select to anon, authenticated
  using (deleted_at is null and moderation_status = 'approved');
create policy "venues admin select" on venues
  for select to authenticated using ((select private.is_admin()));
create policy "venues creator select own pending" on venues
  for select to authenticated using (created_by = (select auth.uid()));
create policy "venues authenticated insert" on venues
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "venues creator or admin update" on venues
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));
create policy "venues admin update" on venues
  for update to authenticated using ((select private.is_admin()));
-- No delete policy: venues soft-delete via deleted_at.
```

Reading: the public sees approved, non-deleted venues. The creator sees their own
regardless of state. An admin sees everything and can update everything. No
delete verb is reachable, so removal is `deleted_at`, which is exactly the S7
posture. The two update policies overlap (the second is redundant given the
first); harmless, since policies OR together, but it is duplication a reader
trips over.

### 2.6 `mic_series`

```sql
alter table mic_series enable row level security;
create policy "series public select" on mic_series
  for select to anon, authenticated
  using (deleted_at is null and moderation_status = 'approved');
create policy "series admin select" on mic_series
  for select to authenticated using ((select private.is_admin()));
create policy "series stakeholder select" on mic_series
  for select to authenticated
  using (created_by = (select auth.uid()) or owner_id = (select auth.uid()));
create policy "series authenticated insert" on mic_series
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (owner_id is null or owner_id = (select auth.uid()))
  );
create policy "series owner update" on mic_series
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (owner_id is null and created_by = (select auth.uid()))
    or (select private.is_admin())
  )
  with check (
    -- Ownership transfers happen through the claim workflow, not raw update.
    owner_id is null
    or owner_id = (select auth.uid())
    or (select private.is_admin())
  );
-- No delete policy: listings soft-delete only.
```

Reading: the public sees approved, live listings. Producers see and edit their
own. An admin sees and edits all, and is the only party who can move `owner_id`
by raw update. This is the one place in the schema where a `WITH CHECK` exists on
an admin-reachable update, and it is there to stop ownership theft by
non-admins. Soft delete only. Note `is_active` (producer pause) is separate from
`deleted_at` (removal) and from `moderation_status` (review state): the console
has three distinct "not visible" states to render honestly.

### 2.7 `claim_requests`

```sql
alter table claim_requests enable row level security;
create policy "claims requester select" on claim_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or (select private.is_admin()));
create policy "claims requester insert" on claim_requests
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from mic_series s
      where s.id = series_id and s.owner_id is null and s.deleted_at is null
    )
  );
create policy "claims admin update" on claim_requests
  for update to authenticated using ((select private.is_admin()));
```

Reading: you see your own claims, an admin sees all, only unclaimed live series
can be claimed, and only an admin resolves. A partial unique index
(`claim_requests_one_pending`) stops duplicate pending claims per requester.
Approval runs through `review_claim`, not through this update policy.

### 2.8 `blocks`

```sql
alter table blocks enable row level security;
create policy "blocks owner select" on blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "blocks owner insert" on blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "blocks owner delete" on blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));
```

Reading: you manage only your own block list and cannot see who blocked you. No
admin policy, deliberately: a moderator has no business reading the graph of who
blocked whom, and does not need to. `blocks_snapshot_name` stores the blocked
person's name at block time so the list stays readable after the profile is
hidden.

### 2.9 `reports` (the abuse queue that already exists)

```sql
create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles (id),
  target_type  report_target not null,   -- series | venue | profile | occurrence | credit
  target_id    uuid not null,            -- no FK on purpose: survives soft delete
  reason       report_reason not null,
  details      text check (char_length(details) <= 1000),
  status       report_status not null default 'open',
  resolved_by  uuid references profiles (id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index reports_queue_idx on reports (status, created_at);

alter table reports enable row level security;
create policy "reports reporter insert" on reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy "reports reporter select own" on reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
create policy "reports admin update" on reports
  for update to authenticated using ((select private.is_admin()));
```

Reading: a signed-in user files a report about themselves as reporter and cannot
file it pre-resolved. Reporters see their own, admins see all, admins resolve.
`reports_rate_limit` (BEFORE INSERT) caps 5 per user per hour. `report_status` is
`open | in_review | actioned | dismissed`. `report_reason` is `spam |
harassment | hate | sexual_content | violence_threat | impersonation | illegal |
other`. `report_target` is `series | venue | profile | occurrence | credit`
(`credit` added by `20260807000800`).

Missing for the console queue: no `severity`, no `assigned_to`, no resolution
note, and the queue index is `(status, created_at)`, which suits oldest-first
sorting but not severity ordering.

Note that resolving a report today happens as a **direct table UPDATE** from the
client (`useResolveReport` in `src/features/safety/queries.ts` writes `status`,
`resolved_by`, `resolved_at`), not through an RPC. Under S5 that has to move
behind a function.

### 2.10 `listing_flags` (the data-quality queue)

```sql
alter table listing_flags enable row level security;
create policy "flags authenticated insert" on listing_flags
  for insert to authenticated
  with check (flagger_id = (select auth.uid()) and status = 'open');
create policy "flags flagger select own" on listing_flags
  for select to authenticated
  using (flagger_id = (select auth.uid()) or (select private.is_admin()));
create policy "flags series owner select" on listing_flags
  for select to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id and s.owner_id = (select auth.uid())
  ));
create policy "flags admin update" on listing_flags
  for update to authenticated using ((select private.is_admin()));
```

Reading: same shape as reports, plus the listing owner sees flags against their
own listing. `flag_reason` is `wrong_time | wrong_venue | wrong_cost |
not_happening | permanently_dead | duplicate | other`. `flag_status` is `open |
confirmed | dismissed`. A partial unique index dedupes open flags per
`(series, flagger, reason)`. Rate limited 5 per user per hour. Resolution goes
through the `resolve_flag` RPC, which is the one moderation action in the system
that already does the right thing: it checks authorization internally and has a
real side effect.

### 2.11 `mic_occurrences`

```sql
alter table mic_occurrences enable row level security;
create policy "occurrences public select" on mic_occurrences
  for select to anon, authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id and s.deleted_at is null and s.moderation_status = 'approved'
  ));
create policy "occurrences stakeholder select" on mic_occurrences
  for select to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id
      and (s.owner_id = (select auth.uid()) or s.created_by = (select auth.uid()))
  ) or (select private.is_admin()));
create policy "occurrences owner update" on mic_occurrences
  for update to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id
      and (s.owner_id = (select auth.uid())
           or (s.owner_id is null and s.created_by = (select auth.uid())))
  ) or (select private.is_admin()));
-- Inserts happen only through the generator (definer) or service role:
-- no insert policy for API roles.
```

Reading: visibility follows the series. No insert verb for API roles at all;
nights exist only because `private.generate_occurrences()` made them. No delete
verb; cancellation is `status = 'cancelled'`. Admin reads and updates all.
`guard_occurrence_featured` rejects rather than holds dirty free text here,
because occurrences carry no `moderation_status` to fall back to.

### 2.12 `signups`

```sql
alter table signups enable row level security;
create policy "signups performer select own" on signups
  for select to authenticated using (performer_id = (select auth.uid()));
create policy "signups producer select" on signups
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()));
create policy "signups performer insert" on signups   -- replaced in 20260728000900
  for insert to authenticated
  with check (
    performer_id = (select auth.uid())
    and not private.is_blocked_by_producer(occurrence_id, (select auth.uid()))
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_performer and p.deleted_at is null
    )
    and exists (
      select 1 from public.mic_occurrences o
      join public.mic_series s on s.id = o.series_id
      where o.id = occurrence_id
        and o.status = 'scheduled'
        and s.signup_method <> 'host_booked'
        and now() >= o.starts_at - s.signup_opens
        and now() <= o.starts_at - s.signup_closes
    )
  );
create policy "signups performer withdraw" on signups
  for delete to authenticated using (performer_id = (select auth.uid()));
create policy "signups producer update" on signups
  for update to authenticated
  using (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()));
create policy "signups producer guest insert" on signups
  for insert to authenticated
  with check (
    guest_name is not null
    and performer_id is null
    and (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()))
    and exists (
      select 1 from public.mic_occurrences o
      where o.id = occurrence_id and o.status = 'scheduled'
    )
  );
create policy "signups producer guest delete" on signups
  for delete to authenticated
  using (
    guest_name is not null
    and (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()))
  );
```

Reading: performers see and withdraw their own; producers see and manage their
night's list plus walk-in guest rows; an admin has producer powers everywhere.
The insert policy is the one place in this schema that reads like a real access
control statement: it enforces the block relationship, the performer role, the
occurrence being live, the signup method, and the signup window, all server side.
Note the sign-up eligibility check is `p.is_performer and p.deleted_at is null`
and says nothing about `moderation_status` or any sanction, which is where a ban
would need to bite (see section 9).

### 2.13 `favorites`, `attendance_log`, `device_push_tokens`, `notification_prefs`

All four are the same shape: `for all to authenticated using (profile_id =
(select auth.uid())) with check (profile_id = (select auth.uid()))`. Owner only,
no admin policy, no public read. Correct, and the console has no business in any
of them.

### 2.14 `attendance_plans`

```sql
alter table attendance_plans enable row level security;
create policy "plans owner select" on attendance_plans
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "plans producer select" on attendance_plans
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id) or (select private.is_admin()));
create policy "plans owner insert" on attendance_plans
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and not private.is_blocked_by_producer(occurrence_id, (select auth.uid()))
    and exists (
      select 1 from public.mic_occurrences o
      where o.id = occurrence_id and o.status = 'scheduled' and o.starts_at > now()
    )
  );
-- No update policy: there is nothing to change. Changing your mind is a delete.
create policy "plans owner delete" on attendance_plans
  for delete to authenticated using (profile_id = (select auth.uid()));
```

Reading: the going list is visible to the person and to the producer running the
night, admins included. Blocks are honored so a headcount cannot leak a name back
to someone who blocked that person.

### 2.15 `mic_credits`

```sql
alter table public.mic_credits enable row level security;

create policy "credits public select" on public.mic_credits
  for select to anon, authenticated
  using (
    moderation_status = 'approved'
    and exists (
      select 1 from public.mic_series s
       where s.id = series_id and s.deleted_at is null and s.moderation_status = 'approved'
    )
  );
create policy "credits admin select" on public.mic_credits
  for select to authenticated using ((select private.is_admin()));
create policy "credits stakeholder select" on public.mic_credits
  for select to authenticated
  using (exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))));
create policy "credits manager insert" on public.mic_credits
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))));
create policy "credits manager update" on public.mic_credits
  for update to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))));
create policy "credits manager delete" on public.mic_credits
  for delete to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))));
```

Reading: reading follows the mic, writing follows ownership. **This is the one
table where an admin has a reachable DELETE**, which is an S7 problem for the
console: the console must not use it, and a migration should take the admin
branch out of the delete policy rather than rely on the console being
well-behaved.

### 2.16 `banned_terms`

```sql
alter table banned_terms enable row level security;
create policy "banned terms admin read" on banned_terms
  for select to authenticated using ((select private.is_admin()));
create policy "banned terms admin write" on banned_terms
  for insert to authenticated with check ((select private.is_admin()));
create policy "banned terms admin delete" on banned_terms
  for delete to authenticated using ((select private.is_admin()));
```

Reading: admin-only list, data not code, extended without a deploy. Seeded with
11 slurs and self-harm phrases. Note this is a second reachable admin DELETE, and
under the brief's role model it is a settings surface, so `moderator` and
`read_only` must not reach it.

### 2.17 `series_search`

```sql
alter table series_search enable row level security;
create policy "series search public select" on series_search
  for select to anon, authenticated
  using (true);
-- No insert/update/delete policies: writes happen only through the
-- SECURITY DEFINER sync functions below.
```

Reading: unconditional public read, and the migration argues the case at length:
presence is the access control, because the sync functions only ever store
documents for publicly visible listings and delete the row the moment that stops
being true. The reason it is not a row predicate is measured: tsquery and trigram
operators are not leakproof, so a predicate forbids them as index conditions and
a zero-hit query went from under 1ms to 180ms at 5,020 documents. I read this as
sound, with one standing obligation: any future column added to this table is
public by construction. It should never carry anything a soft-deleted or rejected
listing would not show.

### 2.18 `notification_outbox`

```sql
alter table notification_outbox enable row level security;
-- Service-role only; no API policies at all.
```

Reading: default-deny for `anon` and `authenticated` despite the blanket table
grant. Triggers enqueue as `SECURITY DEFINER`; the push-sender drains it with the
service role. The `kind` check constraint currently allows `signup_status,
favorite_reminder, new_mic_nearby, weekly_digest, occurrence_cancelled,
confirm_nudge, listing_auto_paused`. Any moderator-to-producer message ("require
edit with a note") needs a new kind, which means altering that constraint.

### 2.19 `test_kit_settings` and `test_kit_objects`

```sql
alter table test_kit_settings enable row level security;
create policy "test kit settings admin select" on test_kit_settings
  for select to authenticated using ((select private.is_admin()));
-- Writes go through test_kit_set_enabled, never straight to the table.

alter table test_kit_objects enable row level security;
create policy "test kit objects admin select" on test_kit_objects
  for select to authenticated using ((select private.is_admin()));
-- No insert, update, or delete policy: only the definer functions below write.
```

Reading: admin-readable, definer-written. `enabled` now defaults to `false` and
existing rows were switched off by `20260807000400`, which closed audit finding
F-001. This matters to the console for one reason: the test kit mints
`auth.users` rows with a password written down in a migration, and one
`is_admin` bit is all it takes to switch it back on and use it. A console admin
who is compromised inherits that. If the console's roles are real, `moderator`
and `read_only` must not be able to reach `test_kit_set_enabled`, and today the
only gate on it is `is_admin()`.

### 2.20 `private.rate_limit_counters`

```sql
alter table private.rate_limit_counters enable row level security;
-- Never API-exposed (private schema) and default-deny for the API roles.
```

Reading: correct. Not in an exposed schema, no policies, and only reachable
through `private.rate_limit(key, max_calls, window, now)`, which is the fixed
window counter the console can reuse for S11.

### 2.21 Views (RLS does not apply; the `security_invoker` setting is the control)

| View                    | `security_invoker`          | Granted to              | Notes                                                                                                                                                                                           |
| ----------------------- | --------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public_profiles`       | off (owner semantics)       | `anon`, `authenticated` | The safe subset. Excludes `display_name`, `birth_year`, `home_location`, `home_city`, `is_admin`. Filters `deleted_at is null`, `moderation_status = 'approved'`, and both directions of block. |
| `performer_public`      | off                         | `anon`, `authenticated` | Performer subset.                                                                                                                                                                               |
| `producer_public`       | off                         | `anon`, `authenticated` | Omits `contact_phone` and `payout_ref`.                                                                                                                                                         |
| `signup_roster`         | on                          | `authenticated`         | Obeys caller RLS. Shows `stage_name`, never `display_name`.                                                                                                                                     |
| `plan_roster`           | on                          | `authenticated`         |                                                                                                                                                                                                 |
| `occurrence_attendance` | off                         | `authenticated`         | Access by construction, documented.                                                                                                                                                             |
| `my_upcoming_nights`    | on                          | `authenticated`         |                                                                                                                                                                                                 |
| `occurrence_spots`      | off                         | `anon`, `authenticated` | Counts only, no names.                                                                                                                                                                          |
| `mic_credit_public`     | off                         | `anon`, `authenticated` | Filters on `moderation_status = 'approved'`.                                                                                                                                                    |
| `blocked_profiles`      | not set, so owner semantics | `authenticated`         | Deliberate: the point is reading a profile the block hides. `where b.blocker_id = auth.uid()` is the access control. Documented in `20260807000500`.                                            |

Reading: the owner-semantics views are the mechanism that lets anonymous
discovery work at all while `profiles` denies non-owner selects outright. It is
the right pattern and it is consistently applied. The console inherits a useful
consequence: **there is no view anywhere that exposes an email address.** Emails
live only in `auth.users`, which no API role can read. Any email reveal in the
console has to go through the service role, which is exactly where S12's reason
string and audit row belong.

---

## 3. The role model as it stands

Three boolean columns on `profiles`, and that is the whole model:

| Column         | Set by                                                            | Meaning                     |
| -------------- | ----------------------------------------------------------------- | --------------------------- |
| `is_performer` | the user, at onboarding                                           | can sign up for mics        |
| `is_producer`  | the user, or `review_claim` on approval                           | can create and run listings |
| `is_admin`     | the owner-email bootstrap trigger, or another admin by raw update | moderator                   |

Producer versus performer is not enforced as a role in the RLS sense. It is
enforced per action:

- Signing up requires `p.is_performer` inside the signup insert policy.
- Running a night requires `private.owns_occurrence_series(occurrence_id)`, which
  resolves the series owner or, for unclaimed series, the creator. Ownership, not
  a role flag, is what actually gates producer power.
- `producer_profiles.verified` is a separate trust signal, worth 0.3 of the
  confidence weight in search ranking. **No code path grants it except the owner
  bootstrap**, which sets `verified = true` for the owner. So today the owner's
  own listings carry a permanent ranking edge and nobody else can earn one. This
  is a known open decision (`docs/audit/PLAN.md` section 5, `DECISIONS_NEEDED.md`
  item 12) and it is the same decision the brief calls "the badge RPC migration".

Admin promotion path today: the hard-coded array in `private.owner_emails()`,
which returns `array['kylewmixon@gmail.com']`, plus `email_confirmed_at is not
null`, plus F-B (any admin can promote anyone by REST). There is no allowlist
table, no invite, no deactivation, and no record of who promoted whom.

There is also an in-app admin screen: `src/app/admin.tsx`, gated on
`profile.data?.is_admin` read client side. It renders the held-content queue,
abuse reports, and listing flags, and calls `moderate_content`, `resolve_flag`,
and a direct `reports` update. **The gate is cosmetic** (RLS is the real
control), which is fine for the app but means the console is not replacing an
empty space: it is replacing a working screen, and the two will both be live
unless that screen is removed.

---

## 4. Existing reporting, flagging, blocking, ban, and soft delete

| Mechanism                      | Exists  | Where                                                                                                                                                                                      |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Abuse reporting                | **Yes** | `reports` table, `report_reason` enum, `src/features/safety/components/report-modal.tsx`, wired into `src/app/mic/[id].tsx` and `src/app/producer/night/[occurrenceId].tsx`                |
| Data-quality flagging          | **Yes** | `listing_flags`, `resolve_flag` RPC, auto-pause on confirmed `permanently_dead`                                                                                                            |
| Blocking                       | **Yes** | `blocks`, `private.is_blocked_pair`, `private.is_blocked_by_producer`, enforced in signup and plan insert policies and in `public_profiles`, plus `blocked_profiles` for managing the list |
| Automated content filter       | **Yes** | `banned_terms` plus `private.text_is_clean(variadic)`, applied by `guard_profile_writes` and `guard_moderated_writes`                                                                      |
| Content moderation state       | **Yes** | `moderation_status` enum on `profiles`, `venues`, `mic_series`, `mic_credits`; `moderate_content` RPC                                                                                      |
| Soft delete                    | **Yes** | `deleted_at` on `profiles`, `venues`, `mic_series`. No DELETE policy exists on any of the three. `mic_occurrences` uses `status = 'cancelled'`                                             |
| Producer pause                 | **Yes** | `mic_series.is_active`, plus `private.auto_pause_stale_series()` at 90 days unconfirmed                                                                                                    |
| Account deletion               | **Yes** | `delete_account()` in app, `delete_account_web(uuid)` for the post-uninstall web path, both delegating to `private.delete_account_for(uuid)`                                               |
| Warning a user                 | **No**  | nothing                                                                                                                                                                                    |
| Suspending a user              | **No**  | nothing                                                                                                                                                                                    |
| Banning a user                 | **No**  | nothing                                                                                                                                                                                    |
| Appeals                        | **No**  | nothing                                                                                                                                                                                    |
| Audit log of moderator actions | **No**  | `resolved_by` and `reviewed_by` stamps only. No before state, no after state, no reason text, no IP, and the stamp is client-supplied on the `reports` path                                |
| Edit history on a listing      | **No**  | `updated_at` only. "Prior reports against the same producer" is derivable by query; "history of edits" is not, because nothing records it                                                  |
| Repeat-offender view           | **No**  | derivable from `reports` by target, but there is no per-actor rollup                                                                                                                       |

So: the reporting half of the brief's companion changes is largely built, and the
enforcement half does not exist at all.

---

## 5. Every function: definer status, `search_path`, internal authorization

125 `create function` statements across the migrations, resolving to fewer
distinct functions because discovery RPCs were replaced repeatedly (each
replacement drops the prior signature first, so no stale overloads linger).

**`search_path` is pinned on all 125.** `20260807000500` closed the last
exception (`private.set_updated_at`) specifically so that "every function pins
`search_path`" becomes a rule with no exception. 97 of them are
`SECURITY DEFINER`.

### 5.1 API-reachable RPCs in `public`

| RPC                                                                                                                                                                                        | Definer     | `search_path` | Internal authorization check                                                                                                                                                | Reading                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mics_near(...)`                                                                                                                                                                           | no, invoker | `public`      | n/a, RLS applies                                                                                                                                                            | Anonymous discovery. `anon`, `authenticated`. Dead to the client since `search_discover` landed; retirement is open decision 12                                       |
| `search_mics(...)`                                                                                                                                                                         | no, invoker | `public`      | n/a, RLS applies                                                                                                                                                            | Same. Also dead to the client                                                                                                                                         |
| `search_discover(...)`                                                                                                                                                                     | no, invoker | `public`      | n/a, RLS applies                                                                                                                                                            | The live ranked query path                                                                                                                                            |
| `private.search_fuzzy_hits(text)`, `private.unaccent_imm(text)`                                                                                                                            | no          | `''`          | n/a                                                                                                                                                                         | Helpers, execute granted to `anon`                                                                                                                                    |
| `signup_counts(uuid)`                                                                                                                                                                      | **yes**     | `''`          | **none, by design**                                                                                                                                                         | Returns `(taken, capacity)` only, no names. Anonymous. A definer with no check is correct here only because the output carries nothing private                        |
| `my_waitlist_rank(uuid)`                                                                                                                                                                   | **yes**     | `''`          | implicit: filters `performer_id = (select auth.uid())`                                                                                                                      | Correct, cannot read anyone else's rank                                                                                                                               |
| `draw_lottery(uuid)`                                                                                                                                                                       | **yes**     | `''`          | **yes**: `owns_occurrence_series` or `is_admin`, else `42501`                                                                                                               | Also refuses once the show has started                                                                                                                                |
| `set_slot_order(uuid, uuid[])`                                                                                                                                                             | **yes**     | `''`          | **yes**: same                                                                                                                                                               |                                                                                                                                                                       |
| `mark_on_deck(uuid, boolean)`                                                                                                                                                              | **yes**     | `''`          | **yes**: same, after loading the row                                                                                                                                        |                                                                                                                                                                       |
| `end_show(uuid)`                                                                                                                                                                           | **yes**     | `''`          | **yes**: same                                                                                                                                                               |                                                                                                                                                                       |
| `moderate_content(report_target, uuid, boolean)`                                                                                                                                           | **yes**     | `''`          | **yes**: `is_admin`, else `42501`                                                                                                                                           | The held-content decision. Handles `profile`, `venue`, `series`, `credit`; raises on anything else                                                                    |
| `resolve_flag(uuid, boolean)`                                                                                                                                                              | **yes**     | `''`          | **yes**: `is_admin`, else `42501`                                                                                                                                           | Resolves and acts: a confirmed `permanently_dead` pauses the listing and notifies the owner                                                                           |
| `review_claim(uuid, boolean)`                                                                                                                                                              | **yes**     | `''`          | **yes**: `is_admin`, else `42501`                                                                                                                                           | Approval flips `is_producer`, creates the producer row, moves `owner_id`, and closes competing claims                                                                 |
| `delete_account()`                                                                                                                                                                         | **yes**     | `''`          | **yes**: `auth.uid() is not null`, else `42501`                                                                                                                             | Delegates to `private.delete_account_for`                                                                                                                             |
| `delete_account_web(uuid)`                                                                                                                                                                 | **yes**     | `''`          | none in body                                                                                                                                                                | Compensated by grants: `revoke execute ... from public, anon, authenticated` then `grant ... to service_role`. The Edge Function proves identity via magic link first |
| `deletion_request_allowed(text, text)`                                                                                                                                                     | **yes**     | `''`          | none in body                                                                                                                                                                | Same grant pattern, service role only                                                                                                                                 |
| `test_kit_seed_scenario`, `test_kit_fill_roster`, `test_kit_shift_occurrence`, `test_kit_restart_night`, `test_kit_set_roles`, `test_kit_reset`, `test_kit_status`, `test_kit_set_enabled` | **yes**     | `''`          | **yes**: `private.test_kit_guard()` checks `is_admin` and the kill switch. `test_kit_set_enabled` checks `is_admin` only, deliberately, so the switch is not a one-way door | Admin-only scenario builders. Off by default since `20260807000400`                                                                                                   |

Reading: the RPC discipline in this codebase is genuinely good. Every privileged
definer function re-checks authorization in its own body with an explicit
`42501`, which is precisely S5's requirement, and the two that do not are locked
by grant instead and are only called by an Edge Function that authenticates
first. The pattern the console needs already exists here and can be copied.

Two caveats:

1. Every check is `is_admin()`. A three-tier role model has to thread a role
   argument or a claim through all of them, or add new functions.
2. `resolve_flag` uses `auth.uid()` for `resolved_by`, so that stamp is
   trustworthy. The `reports` resolution path does not go through an RPC at all,
   so `resolved_by` there is whatever the client sent. `src/app/admin.tsx` passes
   `session.user.id`, which happens to be correct, but nothing enforces it.

### 5.2 Trigger and job functions (not API-reachable, all definer, all pinned)

`set_updated_at`, `is_admin`, `is_blocked_pair`, `is_blocked_by_producer`,
`owns_occurrence_series`, `guard_profile_writes`, `guard_producer_writes`,
`guard_moderated_writes`, `guard_series_confirm`, `guard_occurrence_featured`,
`validate_series_timezone`, `validate_rrule`, `enforce_age_gate`,
`enforce_rate_limit`, `rate_limit`, `text_is_clean`, `snapshot_blocked_name`,
`sync_home_location`, `rrule_matches`, `generate_occurrences`,
`reconcile_future_occurrences`, `series_generate_trigger`,
`series_reconcile_trigger`, `signup_lifecycle`, `clear_on_deck_when_finished`,
`notify_spot_opened`, `queue_signup_notification`, `queue_slot_move_notification`,
`queue_cancellation_notifications`, `queue_favorite_reminders`,
`queue_new_mic_alerts`, `queue_weekly_digest`, `queue_confirm_nudges`,
`queue_signup_reminders`, `auto_pause_stale_series`, `drain_notification_outbox`,
`invoke_push_sender`, `build_series_search`, `series_search_sync_*`,
`delete_account_for`, `owner_emails`, `is_owner_email`,
`bootstrap_owner_profile`, `bootstrap_owner_children`, `test_kit_*` helpers.

`private.drain_notification_outbox()` explicitly revokes execute from `public,
anon, authenticated`, which is the pattern the console's admin functions should
follow.

### 5.3 Edge Functions

| Function           | JWT verified                                           | Privilege    | Authorization                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deletion-request` | **no** (`verify_jwt = false`, the page has no session) | service role | Two-step: a magic link to the address proves control of the email, then the confirm step exchanges the token and calls `delete_account_web`. Responses are identical whether or not an account exists, so it cannot probe for accounts. Rate limited 3 per email per hour, 10 per IP per hour, via salted hashes only |
| `push-sender`      | n/a                                                    | service role | Compares the `Authorization` header against `SUPABASE_SERVICE_ROLE_KEY` with `authHeader.endsWith(serviceKey)` and returns 403 otherwise. Invoked by pg_cron plus pg_net with a vault-stored token                                                                                                                    |

One note on `push-sender`: `endsWith` on a secret is a non-constant-time
comparison of a bearer token. It is not a practical break (the caller must
already know the whole key), but it is the kind of thing the console's own auth
must not copy.

---

## 6. Storage buckets

Two, **both public**:

```sql
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
insert into storage.buckets (id, name, public) values ('posters', 'posters', true);
```

Eight policies on `storage.objects`, four per bucket, identical in shape:

```sql
create policy "avatars public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');
create policy "avatars owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
-- update and delete: same predicate, owner's folder only
```

Reading: read is public, writes are confined to a folder named for the uploader's
own uid. That is the standard Supabase pattern and it holds. Two consequences
for the console:

1. Public read means a rejected avatar or poster is still fetchable by anyone
   holding the URL, even after `moderation_status` flips to `rejected`. Hiding an
   image from the app is not the same as removing it. If the console is meant to
   remove imagery, that is a Storage API delete under the service role, and it is
   a **hard delete**, which collides with S7. It needs an explicit decision:
   either a quarantine bucket the images move into, or a documented exception to
   S7 for binary content.
2. No admin policy exists on `storage.objects`, so the console cannot touch
   images with a user JWT at all. Only the service role can.

The app already relies on this: `useDeleteAccount` removes the avatar through the
Storage API before calling the RPC, because "the database forbids direct storage
deletes".

---

## 7. Custom access token hook

**None exists.** In `supabase/config.toml` both hook blocks are commented out:

```toml
# [auth.hook.before_user_created]
# [auth.hook.custom_access_token]
```

No migration defines a hook function, and nothing in the repo reads a role claim
from a JWT. Every authorization decision in the database reads
`profiles.is_admin` through `private.is_admin()`, which is a table lookup, not a
claim. S4 needs this built from nothing.

One thing to weigh before building it: the custom access token hook fires on
**every token issuance for every user of the mobile app**, not just for console
users. If the hook errors, sign-in fails app-wide. It must be `SECURITY DEFINER`,
pinned, defensive about a missing allowlist row, and cheap. That argues for the
hook reading one indexed allowlist table and nothing else.

---

## 8. The thirteen security requirements against what exists

| #   | Requirement                                                                                                                         | Status today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | What is needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | No privileged key in the client bundle                                                                                              | **Not applicable yet, and the app precedent is good.** The app ships only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; real secrets live in EAS secrets and Edge Function config (ARCHITECTURE.md, 2026-07-28). There is no bundle-grep build step anywhere                                                                                                                                                                                                                     | New: the console's own build step. Grep the built output for `sb_secret_`, `service_role`, `eyJ` JWT prefixes, and fail non-zero on a hit. Wire it into CI, not just the local build                                                                                                                                                                                                                                                                                              |
| S2  | No self signup, invite only from an allowlist                                                                                       | **Not met, and cannot be met by Auth config.** `enable_signup = true` and `auth.email.enable_signup = true` are required by the mobile app. The only "allowlist" is a hard-coded email array in `private.owner_emails()`                                                                                                                                                                                                                                                                           | New `admin_users` and `admin_invites` tables. The console's own gate: a Supabase user with no active `admin_users` row must get a generic 404, not a 403, so the console's existence is not confirmable                                                                                                                                                                                                                                                                           |
| S3  | Mandatory TOTP MFA, AAL2 in middleware and in policy                                                                                | **Not met.** `[auth.mfa.totp]` has `enroll_enabled = false` and `verify_enabled = false`. MFA requires the Supabase Pro plan. No policy anywhere reads `aal`                                                                                                                                                                                                                                                                                                                                       | Enable TOTP on the project (this is safe for the app: enrolment is opt-in, and the app never asks). Enforce AAL2 twice: in console middleware, and in every admin policy and admin RPC via `auth.jwt() ->> 'aal' = 'aal2'`. Note that enabling TOTP project-wide also lets ordinary users enrol, which is a feature, not a risk                                                                                                                                                   |
| S4  | Role from a JWT claim populated by a custom access token hook reading the allowlist                                                 | **Not met at all.** No hook, no claim, no allowlist. Role is `profiles.is_admin`, a table boolean                                                                                                                                                                                                                                                                                                                                                                                                  | Build the hook. Keep it defensive: it runs for every app sign-in. Policies read `auth.jwt() -> 'app_metadata' ->> 'admin_role'`, never a client-supplied value                                                                                                                                                                                                                                                                                                                    |
| S5  | Every privileged mutation through a definer RPC with pinned `search_path` and an internal authorization check                       | **Partially met, and the pattern is already right.** `moderate_content`, `resolve_flag`, `review_claim`, `draw_lottery`, `set_slot_order`, `mark_on_deck`, `end_show` all check internally with `42501` and all pin `search_path`. **But**: resolving a report is a direct client table UPDATE, and the admin policies on `profiles`, `venues`, `mic_series`, `mic_occurrences`, `signups`, `reports`, `listing_flags`, `mic_credits`, `claim_requests` allow raw admin writes that bypass any RPC | New RPCs for every console mutation. Then narrow or drop the raw admin update policies, otherwise the RPC is a front door next to an open window. This is the largest single piece of migration work                                                                                                                                                                                                                                                                              |
| S6  | Append-only audit log with actor, target, action, before, after, reason, timestamp, IP; no UPDATE or DELETE grant; trigger-enforced | **Does not exist.** Only `resolved_by`, `resolved_at`, `reviewed_by`, `reviewed_at` stamps, one of which is client-supplied                                                                                                                                                                                                                                                                                                                                                                        | New table. **Critical**: because of F-C, creating it in `public` grants `anon` `UPDATE` and `DELETE` on it. Either put it outside `public` or revoke explicitly in the same migration, and assert the absence of the grant in pgTAP. Add a `BEFORE UPDATE OR DELETE` trigger that raises unconditionally, per the brief. The IP has to be passed in as an argument by the console server, because Postgres cannot see the client address                                          |
| S7  | No hard deletes; status transitions and soft deletes only                                                                           | **Mostly met by construction, with three exceptions.** No DELETE policy on `profiles`, `venues`, `mic_series`, `mic_occurrences`. Soft delete is the established pattern. Exceptions: `mic_credits` has an admin-reachable DELETE, `banned_terms` has an admin DELETE, and storage objects can only be removed by hard delete                                                                                                                                                                      | Remove the admin branch from the `mic_credits` delete policy. Decide the image question from section 6. `banned_terms` deletion is settings, not moderation; `owner` only                                                                                                                                                                                                                                                                                                         |
| S8  | Step-up reauth within five minutes for destructive actions                                                                          | **Not met.** Nothing reads `amr`. `secure_password_change = true` is the only recency check in the project, and it is about passwords                                                                                                                                                                                                                                                                                                                                                              | Read the `amr` claim's TOTP timestamp inside each destructive RPC and reject when older than five minutes. Enforcing it only in the console would leave the RPC reachable directly                                                                                                                                                                                                                                                                                                |
| S9  | Thirty minute idle, eight hour absolute, refresh rotation, revocation                                                               | **Partially met, and partially in conflict with the app.** `enable_refresh_token_rotation = true` and `refresh_token_reuse_interval = 10` are already set. `jwt_expiry = 3600`. `[auth.sessions]` is entirely commented out, so there is no timebox and no inactivity timeout. **These are project-wide.** A thirty minute inactivity timeout would sign mobile users out every thirty minutes                                                                                                     | Do not set the Auth-level timeouts. Enforce both windows in the console's own session cookie and middleware (idle and absolute), and additionally in policy by rejecting a token whose `iat` is older than the absolute window. Revocation: the `admin_users.active` flag plus Supabase's sign-out-all-sessions admin call. This requirement as literally written cannot be satisfied at the Auth layer on a shared project, and needs your sign-off on the console-level reading |
| S10 | CSP with nonces, `frame-ancestors 'none'`, HSTS preload, `noindex`, `no-referrer`, `nosniff`, `robots.txt`                          | **Not applicable to this repo.** No web console exists. The one existing web surface (`web/delete-account/`) is a static page                                                                                                                                                                                                                                                                                                                                                                      | All new, in the console's middleware                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| S11 | Rate limiting on auth and every mutation, lockout with alerting                                                                     | **Partially met, and reusable.** `private.rate_limit(key, max_calls, window, now)` with an injectable clock is exactly the right primitive and is already applied by BEFORE INSERT triggers to reports, flags, claims, and signups. Auth-level limits exist in `[auth.rate_limit]` (`sign_in_sign_ups = 30` per 5 min per IP)                                                                                                                                                                      | Reuse `private.rate_limit` inside each admin RPC. Lockout and alerting are new. Note the existing counters live in `private`, so the console cannot read them with a user JWT                                                                                                                                                                                                                                                                                                     |
| S12 | PII minimization, masking, reason-gated reveal, no SQL runner, no export                                                            | **Half met by accident, half open.** Strongly in our favour: no view exposes an email, and emails live only in `auth.users`, unreachable by any API role. Against: `producer profile admin select` hands an admin `contact_phone`, `contact_email`, and `payout_ref` with no reason and no record, and `profiles admin select` hands over `birth_year`, `home_location`, `home_city`                                                                                                               | A reveal RPC that takes a reason, writes an audit row, and returns one field for one subject. Narrow the two admin select policies to a column-safe view. No query box and no export are constraints on the console, not migrations                                                                                                                                                                                                                                               |
| S13 | Separate keys per environment, documented rotation                                                                                  | **Not met, and not really started.** `.env.example` documents local values; EAS environment variables carry preview and production. There is no staging Supabase project and no `SECRETS.md`                                                                                                                                                                                                                                                                                                       | `docs/admin/SECRETS.md` plus separate projects. Worth flagging: the brief says the console shares the app's Supabase project, so "separate keys per environment" means per environment, not per application. Local, staging, and production remain three projects, and the console gets its own key set in each                                                                                                                                                                   |

Summary: **S11 is half built and reusable. S7 is close, with three named
exceptions. S5's pattern is already established and correct, it just is not
applied to everything. S1 has a good precedent but no enforcement. Everything
else needs building, and S2, S3, and S9 need a decision about the shared project
before code.**

---

## 9. Data model additions, measured against what exists

| Brief's proposal                                               | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin_users` (user id, role, active, created by, created at)  | **Build as proposed.** Nothing overlaps. It replaces `private.owner_emails()`, which should then read from it or be retired. Roles: `owner`, `moderator`, `read_only`                                                                                                                                                                                                                                                                                           |
| `admin_invites` (email, role, token hash, expiry, consumed at) | **Build as proposed.** Nothing overlaps                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `audit_log`                                                    | **Build as proposed**, with the F-C grant caveat and the trigger. Consider `admin.audit_log` rather than `public.audit_log`, so the default privileges in `20260728001200` never touch it and the API cannot see it even in principle                                                                                                                                                                                                                           |
| `content_reports`                                              | **Do not build. Extend `reports`.** It already has reporter, target type, target id, reason enum, free text, status enum, resolver, resolved at, created at, a queue index, RLS, a rate limit trigger, pgTAP coverage, and two live app screens writing to it. Missing: `severity`, `assigned_to`, `resolution` text. Three `ALTER TABLE` statements beat a parallel table and a data migration, and a second reports table would silently split the queue      |
| `moderation_actions`                                           | **Probably redundant with `audit_log`.** Every field it proposes (target, action, actor, reason, reversible, reversed by, reversed at) is either in `audit_log` already or is a reversal pointer. My recommendation: one append-only `audit_log` plus a nullable `reverses_audit_id` self-reference, so a reversal is itself an audited action pointing at what it undid. Two tables means two places that can disagree about what happened. Open for your call |
| `user_sanctions` (user, type, scope, expiry, reason)           | **Build as proposed.** Nothing exists. The hard part is not the table, it is enforcement (below)                                                                                                                                                                                                                                                                                                                                                                |
| `appeals`                                                      | **Build as proposed**, v2 per the brief's own phasing                                                                                                                                                                                                                                                                                                                                                                                                           |

Two additions the brief does not list but v1 needs:

- **Listing edit history.** v1 feature 2 asks for "history of edits" on a
  listing. Nothing records it. `mic_series` has `updated_at` and no history. This
  is either a new `mic_series_history` table written by an AFTER UPDATE trigger,
  or the feature narrows to "current state plus prior reports". A trigger-based
  history table on a table this wide is not free, and it also becomes a second
  copy of user content that account deletion has to reach. Worth a decision
  rather than a default.
- **A moderator-to-producer note channel.** "Require edit with a note to the
  producer" needs somewhere to put the note and something to deliver it.
  `notification_outbox.kind` is a check constraint that does not include such a
  kind, so this is a constraint alteration plus a note column or table.

### Where a ban actually has to bite

The brief's companion list says "Enforcement of `user_sanctions` at the RLS
layer, not only in the UI", and it is right, but here is the concrete list from
this schema. A banned user must be stopped at:

- `signups performer insert`, whose eligibility clause today is
  `p.is_performer and p.deleted_at is null`
- `plans owner insert`, same shape
- `series authenticated insert` and `venues authenticated insert`
- `mic_series` and `venues` update policies, so a banned producer cannot edit
  live listings
- `credits manager insert` and `credits manager update`
- `reports reporter insert` and `flags authenticated insert`, if a ban is meant
  to stop report abuse
- `public_profiles`, so a banned account stops resolving publicly
- `series_search`, which needs the sync functions to drop documents for a banned
  owner's listings, otherwise a banned producer's mics stay searchable

The cheapest correct shape is one `SECURITY DEFINER STABLE` predicate,
`private.is_sanctioned(uuid)` or `private.can_act(uuid)`, wrapped in `(select
...)` per the `20260801000500` lesson so the planner hoists it, and added to each
policy above. Nine policy rewrites and one function, plus pgTAP for each. That is
a substantial migration and it belongs to the app repo, not the console repo,
which is the first real coupling point between the two codebases.

---

## 10. Things in the brief that are wrong or under-specified for this codebase

Stated plainly, since you asked for it.

1. **"Any existing reporting, flagging, blocking, ban, or soft delete mechanism.
   If none exists, say so."** Four of the five exist and are well built. Only ban
   is missing. The brief's framing (and its `content_reports` proposal) reads as
   though it were a greenfield backend. It is not.

2. **The companion app changes are largely already shipped.** Of the six listed:
   report control exists (two screens, reusable modal, rate limited); block a
   user exists with filtering in both directions at the policy and view layer;
   the EULA with a zero-tolerance clause exists at version 1.2, is accepted at
   signup, and the acceptance is server-stamped by trigger with version and
   timestamp; a visible support contact path exists (`src/lib/support.ts`,
   Settings and the rejected-listing note); in-app account deletion exists, plus
   a post-uninstall web path Google Play requires. **Only one of the six is
   genuinely missing: `user_sanctions` enforcement at the RLS layer**, and that
   one is the largest of them.

3. **S9's numbers cannot be met at the Auth layer on a shared project.** Thirty
   minute idle and eight hour absolute are `[auth.sessions]` settings that apply
   to the mobile app too. Either they are enforced at the console boundary (my
   recommendation, and what I will build unless you say otherwise), or the
   console needs its own Supabase project, which contradicts "It shares the app's
   Supabase project" and would mean no shared `profiles` to moderate.

4. **S2's "no self signup" is likewise not a project setting here.** The app
   needs open signup. What is achievable, and what I read S2 as actually wanting,
   is that a Supabase account with no `admin_users` row gets a generic 404 from
   the console and no signal that it exists. Note the honest limit: such a user
   still holds a valid app JWT and can still reach the REST API as any user can.
   The allowlist gates the console and the admin RPCs, not the API.

5. **"Two independent gates, neither allowed to be the only thing standing
   between the internet and the data" is not quite achievable as stated, and the
   gap is worth naming.** Cloudflare Access protects the console origin. It does
   not protect the Supabase REST API, which is on `*.supabase.co` and is
   internet-facing by design. So for anything reachable by a user JWT, the
   database is the only gate. That is an argument for putting the console's
   privileged reads behind server-side RPCs with `aal2` checks rather than
   relying on RLS with an admin JWT, and for the admin tables living outside the
   exposed `public` schema. It changes the design; it is not a reason to skip
   either gate.

6. **F-B is a live hole the brief does not mention.** Any admin can promote any
   user to admin through the public REST API today. Whatever the console does,
   that policy needs a `WITH CHECK` and a column guard, or `is_admin` writes need
   to move behind an RPC entirely. I would fix this in the app repo before the
   console ships, independently of the console.

7. **The console does not replace nothing, it replaces `src/app/admin.tsx`.** The
   in-app moderation screen works today and calls the same RPCs. Leaving both
   live means two moderation surfaces with different audit behaviour, and the
   in-app one has none. Decision needed: remove the app screen when the console
   ships, or keep it as a read-only view.

8. **"Grant a badge" appears in S8's destructive-action list, and there is no
   badge grant path to protect.** The nearest thing is
   `producer_profiles.verified`, which nothing but the owner bootstrap can set,
   and which carries 0.3 of the search-ranking confidence weight. Per the brief I
   am not choosing; the options are laid out in section 11.

9. **Minor: `docs/admin/` is inside the app repo.** The brief asks for
   `/docs/admin/SCHEMA-REPORT.md` while also requiring a separate repository for
   the console. This report is in the app repo because that is what I was pointed
   at and because the schema it describes lives here. `SECRETS.md`, `RUNBOOK.md`,
   and `SECURITY-VERIFICATION.md` are console documents and belong in the console
   repo. Confirm which you want where.

---

## 11. The framework question, and the badge decision

**Framework: Next.js 15 App Router is the right call and I am not going to argue
against it.** Server components and server actions map exactly onto "all
privileged access happens server side", the middleware layer is where S3, S9, and
S10 live, and nonce-based CSP is well-trodden there. The one thing I would add to
the brief's architecture: prefer the **user's JWT plus RLS plus `aal2` policy
predicates** for reads, and definer RPCs for writes, using the service role only
for the few operations that genuinely need `auth.users` (email reveal, session
revocation). The service role bypasses RLS entirely, so a console built on it
loses S3's "again in database policy" and S4's claim enforcement, which are two
of the requirements the brief calls non-negotiable. Host: whatever you already
pay for, behind Cloudflare Access, on an admin-only subdomain.

**Badge decision, options only, not a recommendation.** The subject is
`producer_profiles.verified`, and the state of play is: the stewardship migration
`20260804000100_discovery_stewardship.sql` is committed but has not been applied
to the hosted project; `verified` is worth 0.3 of the confidence weight in
`search_discover` ranking; the only thing that sets it is the owner bootstrap, so
today it is a permanent ranking edge for your own listings and unreachable for
everyone else.

- **Option A: stop the bootstrap setting `verified = true`, build nothing.** One
  migration, no new surface, no new decision. Kills the unearned ranking edge.
  The badge stays dead for everyone until a real programme exists. This is what
  `docs/audit/PLAN.md` section 5 recommends before launch.
- **Option B: an owner-only `grant_badge` RPC, audited, step-up reauth, in the
  console.** Smallest thing that makes the field mean something. Cost: you are
  now the verification programme, one producer at a time, with no criteria
  written down. Reviewable decisions need criteria or they become favouritism
  with an audit log.
- **Option C: derive it instead of granting it.** Confirmation streak, flag rate,
  report rate, months live. No RPC, no console screen, no discretion, and it
  cannot be lobbied for. Cost: a scheduled job, a definition to tune, and a
  producer-facing explanation of why the badge appeared or vanished.
- **Option D: drop `verified` from the ranking weight entirely and keep it as a
  display-only badge.** Decouples trust display from search position, which is
  the part that actually distorts discovery. Then A, B, or C becomes a much
  smaller decision.

Tradeoff in one line: A is free and honest but ships nothing; B is fast but makes
you a bottleneck and needs written criteria; C is fair and automatic but is real
work and can surprise producers; D shrinks the stakes of all three and can be
combined with any of them.

**Support inbox** is not a decision I need for Phase 1 either way. The
placeholder already exists in exactly the shape the brief asks for:
`SUPPORT_EMAIL` in `src/lib/support.ts`, currently `support@openmicfinder.app`,
one line to change. The console can import the same constant or duplicate it with
a pointer.

---

## 12. What I recommend for Phase 1, and what I am waiting on

Recommended order, if you approve:

1. **App repo, before any console code**: fix F-B (the admin self-promotion
   hole). One migration, one pgTAP file. It is independent of everything else and
   it is the worst thing in this report.
2. **App repo**: `admin_users`, `admin_invites`, `audit_log` (outside `public`),
   the custom access token hook, and the explicit revokes that F-C makes
   necessary. Plus the three `ALTER TABLE` statements on `reports`. Every one
   with a pgTAP test in the same commit, per the standing rule.
3. **App repo**: `user_sanctions` and `private.can_act()`, threaded through the
   nine policies in section 9.
4. **Console repo**: scaffold, gates, queue, audit viewer, admin management.
5. **Both**: the Phase 4 verification document.

Steps 2 and 3 are migrations against the app's database, so they land in this
repo and run through `scripts/db/verify-local.sh`. Only step 4 is the separate
repository. That split is worth agreeing on explicitly before I start, because
"separate repository" in the brief could be read as putting the migrations there
too, and migrations for one database belonging to two repos is how a schema drifts.

Answers I need before writing code:

1. **S9**: do you accept console-level enforcement of the thirty minute and eight
   hour windows, leaving the mobile app's session behaviour untouched? (My
   recommendation: yes. The alternative harms the app.)
2. **Audit log**: one `audit_log` with a reversal self-reference, or the brief's
   two tables (`audit_log` plus `moderation_actions`)?
3. **`reports` versus `content_reports`**: confirm extend, not add.
4. **Listing edit history**: build the history table, or narrow v1 feature 2 to
   current state plus prior reports?
5. **The in-app admin screen**: remove when the console ships, or keep read only?
6. **Rejected images**: quarantine bucket, or a documented S7 exception for
   binary content?
7. **Repo split**: migrations in the app repo, console app in its own repo.
   Confirm.
8. **Supabase Pro**: is the project on a plan that has MFA? S3 is blocked on it.
9. **The badge**: A, B, C, or D from section 11.

Nothing is blocked on all nine. Items 1, 3, and 7 gate the start; the rest gate
specific pieces and I can sequence around them.

Stopping here as instructed. No code written, no migration added, nothing
scaffolded.
