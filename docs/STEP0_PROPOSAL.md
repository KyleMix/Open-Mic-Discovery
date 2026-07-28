# Step 0 Proposal

Date: 2026-07-28. Status: awaiting approval. Nothing in this document has been implemented. No migrations, no app scaffold, no code.

This document contains the four Step 0 deliverables:

1. Clarifying questions (batched)
2. Full database schema as SQL DDL, with rationale and flags on the brief's model
3. Exact dependency versions to pin, including the architecture and animation combination
4. Repo structure

---

## 1. Clarifying questions

Each question includes a recommended default. If you reply "approved with defaults," I will proceed with the recommendations as written.

**Q1. Comments and reviews.** The Guideline 1.2 section requires a Report action on "every listing, comment, review, and profile," but the data model has no comments or reviews entities, and the "Things NOT to build" section excludes social features. Are user comments or reviews in v1 scope at all?
Recommendation: no comments or reviews in v1. They multiply the moderation burden exactly like a feed would. Report then applies to listings, venues, and profiles. The schema below supports adding new report target types later without migration pain.

**Q2. Series ownership vs claimed_by.** The brief gives mic_series both a "producer reference" and a "claimed_by producer reference." These look redundant. I propose splitting the concepts: `created_by` (who entered the listing: an admin seeding a city, a performer adding a mic they attend, or the producer themselves) and `owner_id` (the producer who controls it, null until claimed), plus a `claim_requests` table for the verification workflow. Confirm this reading, or tell me what distinction you intended.

**Q3. host_booked signup method.** For mics where the host books the lineup, is there any in-app action for performers, or is it display-only with the producer's public contact route?
Recommendation: display-only in v1, with clear copy explaining how booking works for that mic. An in-app "request a spot" inbox is a DM system in disguise.

**Q4. Signup window close.** The brief specifies a signup opens offset. Does signup also close, and when?
Recommendation: signups close at `starts_at` by default, with an optional per-series close offset. Producers can still add walk-ups manually after close.

**Q5. Lottery draw trigger.** Is the lottery drawn manually by the producer (a button with visible randomization, per Phase 4) or automatically at a scheduled time?
Recommendation: manual producer-triggered draw in v1. Scheduled auto-draw is an easy later addition; the reverse migration is awkward.

**Q6. Claim verification mechanism.** What proves a person actually runs a mic? Options: admin-reviewed claim queue (you approve each claim during the seeded-city era), venue email domain match, or phone verification against the venue.
Recommendation: admin-reviewed claim queue in v1. During cold start you are the admin and you know the scene. The schema models claims as a request/review workflow so a more automated verification can slot in later.

**Q7. Age gating depth.** Apple requires honest rating (17+ given adult language in comedy). Do we collect date of birth at signup and hard-gate minors, or rely on the store age rating plus an in-app 17+ confirmation?
Recommendation: collect year of birth at signup, block account creation under 17, and rate 17+. This is the defensible position under the 2026 enforcement climate and costs one onboarding field.

**Q8. Geography and currency for v1.** Is v1 US-only with USD? This affects `cost_cents` (no currency column), address modeling, and the content filter's language assumptions.
Recommendation: yes, US-only v1, USD assumed, with `country` fields present so international is a data change, not a schema change.

**Q9. Anonymous browsing.** Can a logged-out user browse the map and listings, with an account required only for favorites, signup, flagging, and producer actions?
Recommendation: yes. Discovery is the wedge; do not put a signup wall in front of it. This shapes the RLS policies below (public read on listings, venues, occurrences).

**Q10. Waitlist promotion.** When a confirmed performer drops, does the top waitlisted performer auto-promote, or does the producer promote manually?
Recommendation: producer-controlled with a one-tap promote in v1. Auto-promotion needs notification deadlines and reclaim windows, which is real complexity to get right later.

---

## 2. Database schema (SQL DDL)

### Flags on the brief's model (things I think are wrong or need adjustment)

- **F1: Ownership split.** See Q2. The DDL below uses `created_by` plus `owner_id` plus a `claim_requests` table instead of the ambiguous producer/claimed_by pair.
- **F2: attendance_log overlaps signups.** A signup with status `performed` already records that a performer played a night. I kept `attendance_log` but defined it narrowly as a performer's personal, self-reported history: mics played before the app existed, mics without in-app signup, walk-ups. It never drives producer-facing features. If you would rather derive history purely from signups and drop the table, say so.
- **F3: "Every read policy excludes blocked users" needs scoping.** Applying a block filter to anonymous public reads is impossible (there is no blocker), and applying it per-row to hot discovery queries has a real performance cost. The DDL applies block filtering where it matters: profiles, signups/lineups, and any surface showing another user's content to a logged-in user, via an indexed helper function. Discovery of a series is not hidden just because you blocked its producer; the producer's profile and free text are. I believe this matches Apple's intent (the blocker does not see the blocked user's content). If you want blocked producers' entire listings hidden from the blocker, that is one more predicate in the discovery RPC, at some query cost. Confirm scope.
- **F4: Phase 7 paid slots must not use IAP.** Flagging now because the working agreement says guidelines win: paying for a slot at a real-world open mic is a real-world service under Apple Guideline 3.1.5(a) and must NOT go through StoreKit/IAP (and Apple takes no cut). RevenueCat/StoreKit is correct for the Producer Pro subscription (a digital service) but paid slots need an external processor (Stripe) when we get to Phase 7. No schema impact now beyond keeping `payout_ref` opaque.
- **F5: Idempotency key for occurrences.** `unique(series_id, starts_at)` breaks the moment a producer changes the series start time (the regenerated occurrence no longer matches). The DDL keys occurrences on `(series_id, local_date)`, the calendar date in the series timezone. One occurrence per series per local day is a real-world constraint for open mics, and it makes the generator naturally idempotent: `on conflict do nothing` never clobbers overrides or cancellations.
- **F6: EULA needs its own table.** Storing only "accepted version + timestamp" on profiles is kept, but a `eula_versions` table holds the actual texts so we can prove what a user accepted, which is the point of the requirement.

### Conventions

- Every table: RLS enabled, `created_at`/`updated_at` via trigger, soft delete via `deleted_at` where the brief requires it.
- All user-visible free text passes through the content filter (Edge Function) before insert/update; the filter is enforced at the API layer in v1, with a `moderation_status` column on the free-text-bearing rows so nothing unfiltered goes live.
- `citext` for handles, `postgis` for geography.

```sql
-- Extensions
create extension if not exists postgis;
create extension if not exists citext;
create extension if not exists pg_cron;      -- occurrence refresh scheduling (or EF cron, see rationale)

-- Enums
create type discipline as enum ('music', 'comedy', 'poetry', 'other');
create type signup_method as enum ('lottery', 'first_come', 'reserved_slot', 'host_booked');
create type occurrence_status as enum ('scheduled', 'cancelled', 'moved', 'completed');
create type signup_status as enum ('requested', 'confirmed', 'waitlisted', 'drawn', 'performed', 'no_show');
create type experience_level as enum ('new', 'developing', 'experienced', 'professional');
create type age_restriction as enum ('all_ages', 'eighteen_plus', 'twenty_one_plus');
create type report_target as enum ('series', 'venue', 'profile', 'occurrence');
create type report_reason as enum ('spam', 'harassment', 'hate', 'sexual_content', 'violence_threat', 'impersonation', 'illegal', 'other');
create type report_status as enum ('open', 'in_review', 'actioned', 'dismissed');
create type flag_reason as enum ('wrong_time', 'wrong_venue', 'wrong_cost', 'not_happening', 'permanently_dead', 'duplicate', 'other');
create type flag_status as enum ('open', 'confirmed', 'dismissed');
create type claim_status as enum ('pending', 'approved', 'rejected');
create type moderation_status as enum ('pending', 'approved', 'rejected');

-- EULA versions: immutable record of every EULA text ever shown.
-- Rationale (F6): acceptance proof requires the text, not just a version number.
create table eula_versions (
  version        text primary key,            -- semver-ish, e.g. '1.0'
  body_md        text not null,
  published_at   timestamptz not null default now()
);

-- Profiles: 1:1 with auth.users.
create table profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  handle                citext not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name          text not null check (char_length(display_name) between 1 and 60),
  avatar_url            text,
  bio                   text check (char_length(bio) <= 500),
  home_city             text,
  home_location         geography(point, 4326),   -- private: never exposed to other users (RLS)
  birth_year            smallint,                 -- age gate (Q7); private
  is_performer          boolean not null default false,
  is_producer           boolean not null default false,
  is_admin              boolean not null default false,  -- moderation queue access; set only via service role
  eula_version          text references eula_versions (version),
  eula_accepted_at      timestamptz,
  moderation_status     moderation_status not null default 'pending',  -- free text filter state
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz               -- anonymization tombstone (account deletion)
);

create table performer_profiles (
  profile_id       uuid primary key references profiles (id) on delete cascade,
  disciplines      discipline[] not null default '{}',
  experience       experience_level,
  links            jsonb not null default '[]',  -- [{kind: 'video'|'instagram'|..., url}]
  tags             text[] not null default '{}', -- instruments, styles
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table producer_profiles (
  profile_id       uuid primary key references profiles (id) on delete cascade,
  contact_email    text,
  contact_phone    text,        -- PRIVATE: RLS exposes only to the owner; public reads go through a view that omits it
  payout_ref       text,        -- opaque reference into the payment provider, never raw details (F4)
  verified         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table venues (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  address_line     text not null,
  neighborhood     text,
  city             text not null,
  region           text not null,          -- state/province
  country          text not null default 'US',
  location         geography(point, 4326) not null,
  age_restriction  age_restriction,        -- null = unknown; unknown is honest, not 'all ages'
  wheelchair_accessible boolean,           -- tri-state: null = unknown
  has_pa           boolean,
  has_stage        boolean,
  parking_notes    text,
  phone            text,
  website          text,
  created_by       uuid references profiles (id),
  moderation_status moderation_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index venues_location_gist on venues using gist (location);

-- Mic series: the recurring definition.
create table mic_series (
  id                    uuid primary key default gen_random_uuid(),
  venue_id              uuid not null references venues (id),
  created_by            uuid references profiles (id),         -- who entered it (F1)
  owner_id              uuid references producer_profiles (profile_id),  -- controlling producer, null until claimed (F1)
  title                 text not null check (char_length(title) between 1 and 120),
  disciplines           discipline[] not null check (cardinality(disciplines) > 0),
  description           text check (char_length(description) <= 2000),
  rrule                 text not null,          -- RFC 5545 RRULE, validated in app + generator
  timezone              text not null,          -- IANA name; trigger-validated against pg_timezone_names
  signup_method         signup_method not null,
  signup_opens          interval not null default interval '7 days',  -- before starts_at
  signup_closes         interval not null default interval '0',       -- before starts_at (Q4); 0 = closes at start
  set_length_minutes    smallint check (set_length_minutes > 0),
  cost_cents            integer not null default 0 check (cost_cents >= 0),
  cost_note             text,
  capacity              smallint check (capacity > 0),
  is_active             boolean not null default true,
  last_confirmed_at     timestamptz,
  last_confirmed_by     uuid references profiles (id),
  moderation_status     moderation_status not null default 'pending',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz             -- soft delete only, per brief
);
create index mic_series_venue_idx on mic_series (venue_id);
create index mic_series_owner_idx on mic_series (owner_id);
create index mic_series_disciplines_gin on mic_series using gin (disciplines);

-- Claim workflow (F1, Q6): admin-reviewed in v1.
create table claim_requests (
  id             uuid primary key default gen_random_uuid(),
  series_id      uuid not null references mic_series (id),
  requester_id   uuid not null references profiles (id),
  evidence       text,                  -- "I host this, here is my IG" etc.
  status         claim_status not null default 'pending',
  reviewed_by    uuid references profiles (id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (series_id, requester_id, status)  -- one pending claim per user per series
);

-- Occurrences: materialized 90-day rolling window.
-- Idempotency (F5): keyed on (series_id, local_date). Generator inserts with
-- ON CONFLICT DO NOTHING, so cancellations and overrides are never clobbered.
create table mic_occurrences (
  id                  uuid primary key default gen_random_uuid(),
  series_id           uuid not null references mic_series (id),
  local_date          date not null,            -- calendar date in the series timezone
  starts_at           timestamptz not null,
  doors_at            timestamptz,
  status              occurrence_status not null default 'scheduled',
  override_title      text,
  override_cost_cents integer check (override_cost_cents >= 0),
  override_venue_id   uuid references venues (id),
  cancellation_note   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (series_id, local_date)
);
create index mic_occurrences_starts_idx on mic_occurrences (starts_at);
create index mic_occurrences_series_idx on mic_occurrences (series_id, starts_at);

create table signups (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null references mic_occurrences (id),
  performer_id   uuid not null references profiles (id),
  status         signup_status not null default 'requested',
  slot_position  smallint,        -- null until ordered/drawn
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (occurrence_id, performer_id)
);
create index signups_performer_idx on signups (performer_id, created_at desc);
create index signups_occurrence_idx on signups (occurrence_id, slot_position);

create table favorites (
  profile_id   uuid not null references profiles (id) on delete cascade,
  series_id    uuid not null references mic_series (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (profile_id, series_id)
);

-- Personal, self-reported performance history (F2). Never producer-facing.
create table attendance_log (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles (id) on delete cascade,
  series_id     uuid references mic_series (id),
  occurrence_id uuid references mic_occurrences (id),
  performed_on  date not null,
  note          text check (char_length(note) <= 500),
  created_at    timestamptz not null default now()
);
create index attendance_log_profile_idx on attendance_log (profile_id, performed_on desc);

-- Abuse reports (Guideline 1.2). Polymorphic target: enum + uuid, no FK.
-- Rationale: reports must survive target soft-deletion and span four target
-- types; integrity is enforced in the reporting RPC instead.
create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles (id),
  target_type  report_target not null,
  target_id    uuid not null,
  reason       report_reason not null,
  details      text check (char_length(details) <= 1000),
  status       report_status not null default 'open',
  resolved_by  uuid references profiles (id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index reports_queue_idx on reports (status, created_at);

create table blocks (
  blocker_id  uuid not null references profiles (id) on delete cascade,
  blocked_id  uuid not null references profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on blocks (blocked_id);

-- "This info is wrong / this mic is dead": data quality, not abuse.
create table listing_flags (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid not null references mic_series (id),
  flagger_id  uuid not null references profiles (id),
  reason      flag_reason not null,
  details     text check (char_length(details) <= 500),
  status      flag_status not null default 'open',
  resolved_by uuid references profiles (id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index listing_flags_series_idx on listing_flags (series_id, status);

-- Push infrastructure (Phase 4/6, tables land now so RLS ships with them).
create table device_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  expo_token  text not null unique,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now()
);

create table notification_prefs (
  profile_id        uuid primary key references profiles (id) on delete cascade,
  signup_updates    boolean not null default true,
  favorite_reminders boolean not null default true,
  new_mic_nearby    boolean not null default false,  -- opt-in, uses radius
  nearby_radius_km  smallint not null default 25,
  weekly_digest     boolean not null default false,
  updated_at        timestamptz not null default now()
);
```

### RLS approach (policies ship in the same migrations; summarized here)

- **Helper functions** in a `private` schema, `security definer`, `stable`: `private.is_admin()`, `private.is_blocked_pair(a uuid, b uuid)` (checks `blocks` both directions where relevant, backed by the PK and `blocks_blocked_idx`).
- **Public read (anon + authenticated)**: `venues`, `mic_series`, `mic_occurrences` where `deleted_at is null and moderation_status = 'approved'` (Q9). Seeded content is approved at import.
- **profiles**: anyone authenticated reads public columns of non-deleted, approved profiles excluding rows where `is_blocked_pair(auth.uid(), id)`; `home_location` and `birth_year` are exposed only via a column-limited view (RLS cannot hide columns, so client reads go through `public_profiles` view; base-table select is denied to non-owners).
- **producer_profiles**: `contact_phone` and `payout_ref` never leave the owner row; public contact goes through a view exposing only `contact_email` and `verified` for owners of claimed series.
- **mic_series**: insert by any authenticated user (community-created listings feed the flywheel, subject to content filter); update/delete only by `owner_id`, `created_by` while unclaimed, or admin. `last_confirmed_*` updates additionally allowed to the owner via a dedicated one-tap RPC.
- **signups**: performer inserts/cancels own rows within the open window; producer of the occurrence's series updates status/slot_position; reads limited to the performer, the series owner, and (for the posted lineup) public read of confirmed rows with block filtering.
- **reports/listing_flags**: insert by any authenticated user; read/update by admins only (plus reporter sees their own).
- **blocks**: owner-only.
- **Every table**: default deny; a pgTAP test per table asserts the anon and wrong-user cases fail.

### Other schema-level decisions worth calling out

- **Occurrence generation**: nightly scheduled job (pg_cron calling a SQL function, with an Edge Function fallback if we prefer app-side RRULE parsing; decision documented in Phase 1) expands each active series' RRULE in the series timezone 90 days forward, computing `starts_at` from local wall-clock time so DST transitions land correctly, then bulk inserts with `on conflict (series_id, local_date) do nothing`.
- **"This night only" edits** write override columns on the occurrence. **"This and all future"** edits update the series and regenerate only future non-overridden, non-cancelled occurrences (the conflict key makes this safe).
- **Account deletion**: auth user hard-deleted; `profiles` row anonymized (handle, name, avatar, bio, location nulled; `deleted_at` set) rather than cascaded, because signups and lineup history reference it. This is the "documented anonymization" path and will be written up in the compliance checklist.
- **Timezone validation**: a trigger on `mic_series` rejects any `timezone` not present in `pg_timezone_names`.

---

## 3. Dependency versions

Verified against the npm registry today (2026-07-28). Exact patch versions of `expo-*` packages get finalized by `npx expo install` at Phase 0 scaffold time so every Expo package is SDK-matched; the pins below are the versions I intend to land.

### The architecture and animation combination

**Chosen: New Architecture with Reanimated 4 + react-native-worklets.** Since the brief was written, this stopped being a choice: React Native 0.82+ removed the legacy architecture entirely, and Expo SDK 57 ships RN 0.86. Reanimated 3 is not an option on this stack. The remaining tradeoff is third-party library maturity on New Architecture, which is why every native dependency below was checked for New Arch support. This combination will be recorded in ARCHITECTURE.md with renovate/dependabot configured to never bump these majors automatically.

| Package                       | Pin                 | Notes                                                 |
| ----------------------------- | ------------------- | ----------------------------------------------------- |
| expo                          | ~57.0.8             | Latest stable SDK, RN 0.86.2, React 19, New Arch only |
| react-native                  | 0.86.2              | Fixed by SDK 57                                       |
| expo-router                   | ~57.0.8             | Typed routes on                                       |
| react-native-reanimated       | ~4.5.3              | Requires worklets package                             |
| react-native-worklets         | ~0.11.3             | Reanimated 4 peer                                     |
| react-native-maps             | 1.29.0              | New Arch supported                                    |
| @tanstack/react-query         | ^5.101.4            | All server state                                      |
| zustand                       | ^5.0.14             | Client-only state                                     |
| @supabase/supabase-js         | ^2.111.0            | Plus generated types                                  |
| react-native-purchases        | ^10.4.4             | RevenueCat (Phase 7)                                  |
| @sentry/react-native          | ~8.20.0             | Via Expo config plugin                                |
| expo-location                 | ~57.0.6             | Foreground only                                       |
| expo-notifications            | ~57.0.7             | Expo Push                                             |
| typescript                    | ~5.9.x              | See tradeoff below                                    |
| jest-expo                     | ~57.x               | Unit tests                                            |
| @testing-library/react-native | latest 13.x         |                                                       |
| Maestro                       | pinned in CI config | Binary, not an npm dep                                |

### Tradeoffs to sign off on

- **TypeScript 5.9, not 7.** npm `latest` for typescript is now 7.0.2, the Go-based compiler. The RN/Expo toolchain (babel transforms, jest-expo, typescript-eslint) is not uniformly compatible with it yet. Pinning ~5.9 (the SDK 57 template pin) is the boring, correct choice; we revisit when Expo templates move.
- **Marker clustering.** The commonly recommended `react-native-map-clustering` wrapper is poorly maintained and predates New Arch. I intend to build clustering directly on `supercluster` (the same engine that library wraps) in a small component of our own. Cost: roughly a day of work in Phase 2. Benefit: no dead dependency underneath the app's single most important screen.
- **RLS testing.** pgTAP via `supabase test db`, with the community supabase-test-helpers for impersonating users in tests. This is the only stack addition not named in the brief; it exists to satisfy the "test that asserts an unauthorized role cannot read or write" requirement.

---

## 4. Repo structure

Single repository, single Expo app, Supabase project colocated.

```
/
  app/                      # Expo Router routes only (thin files that compose from src/)
    (auth)/                 #   sign-in, sign-up, EULA gate, onboarding
    (tabs)/                 #   discover (map/list), favorites, producer dashboard, profile
    mic/[id]/               #   listing detail, occurrence detail, signup
    settings/               #   account, notifications, deletion (two taps from settings root)
  src/
    components/             # shared UI primitives (dark-first theme)
    features/               # feature modules: discovery/, series/, signups/, moderation/, ...
      <feature>/            #   components, hooks (TanStack Query), api.ts per feature
    lib/                    # supabase client, query client, location, notifications, sentry
    stores/                 # zustand (client-only state: filters UI state, onboarding progress)
    theme/                  # tokens: colors (per-discipline accents), spacing, type scale
    types/                  # generated supabase types (database.types.ts) + app types
  supabase/
    migrations/             # numbered SQL migrations, RLS policies alongside each table
    functions/              # Edge Functions: content-filter, occurrence-generator, push-sender
    seed/                   # PNW seed data + admin bulk-import script
    tests/                  # pgTAP RLS tests
  e2e/                      # Maestro flows
  docs/
    STEP0_PROPOSAL.md       # this file
    COMPLIANCE.md           # guideline -> implementing file map (Phase 5)
    privacy/                # PrivacyInfo.xcprivacy source, Play Data Safety content
  assets/                   # icons, splash, marker sprites
  ARCHITECTURE.md           # stack, architecture/animation combo, decisions log
  REVIEW_NOTES.md           # demo credentials + walkthroughs (Phase 1+)
  PROJECT.md                # the brief + Progress Log
```

Rationale: `app/` stays route-only so screens are testable from `src/features` without the router. Feature folders keep each phase's work localized. Supabase lives in-repo so a migration, its RLS policies, and its pgTAP test land in one commit, which is how the "no table ships without policies" gate stays enforceable in review.

---

## Awaiting your review

Reply with answers to the ten questions (or "approved with defaults"), any objections to flags F1 through F6, and sign-off on the TypeScript and clustering tradeoffs. Then I will begin Phase 0.
