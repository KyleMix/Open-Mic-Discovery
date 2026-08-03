# Decisions needed before the remaining UX fixes can land

Everything here was deliberately not implemented on the `ux-fixes` branch because it needs a database migration, new infrastructure, a new dependency, or a product call. Each entry has a recommendation so a yes is enough to proceed. Per the repo rules, every migration below ships with RLS and pgTAP in the same commit.

## 1. Cancellation notifications (report fix 5, major)

Cancelling a night notifies nobody, including performers already confirmed for it. Needs a migration: extend the `notification_outbox.kind` check constraint with `occurrence_cancelled` and add an AFTER UPDATE trigger on `mic_occurrences` that enqueues one row per signup when status changes to cancelled (gated on `signup_updates`, including the cancellation note in the body).
Recommendation: do it. This is the highest-value remaining fix and the outbox pattern is already proven.

## 2. Walk-in / guest signups (report 4.2, blocker remainder)

Hosts cannot add the person standing in front of them; every name on the list needs an account. Needs a schema change on `signups`: either a nullable `performer_id` plus a `guest_name` column, or a separate guests table. RLS: only the occurrence owner may insert or update guest rows; guests never receive notifications.
Recommendation: `guest_name text` column with `performer_id` made nullable and a check that exactly one of the two is set. Roster UI then gets an "Add a walk-in" field.

## 3. Performer-visible spot counts or roster (report 2.4, major)

Performers cannot see how many spots are taken or their position relative to capacity. RLS restricts `signup_roster` to self plus producer. Two options: (a) a `signup_counts(occurrence_id)` SECURITY DEFINER RPC returning taken and capacity only, no names; (b) a policy letting confirmed signups of the same occurrence read the roster.
Recommendation: (a) first. It is anonymous, cheap, and the signup card can show "7 of 15 spots taken" next to the button.

## 4. Blocked users list shows who is blocked (report Q13 remainder)

Settings renders the literal string "Blocked user" per row because blocks hide the blocked profile from `public_profiles` bidirectionally. Needs a view or RPC that returns the handle and display name of rows in `blocks` where `blocker_id = auth.uid()`.
Recommendation: a small `blocked_profiles` view with `security_invoker = off` scoped to the blocker. Until then the copy was clarified but rows remain unidentifiable.

## 5. Auto-write attendance history on performed (report 2.1 remainder)

"My nights" now builds history from signups. The purpose-built `attendance_log` table stays unused; populating it when a producer marks `performed` needs a trigger, and manual backfill entries need a small form.
Recommendation: defer the trigger until you also want producer-independent history (walk-ups, pre-app nights); the signups-based view covers the current need.

## 6. The trust loop (report Phase 4, items 1 to 5)

Confirm nudges to producers, flag dedupe and thresholds, "confirmed dead" pausing the listing, community re-confirmation, and auto-pause after long unconfirmed periods all need migrations (new outbox kinds, a unique index on `listing_flags`, cron queries) and one product decision: how aggressive auto-pause should be.
Recommendation: start with the two cheapest: the flag dedupe unique index, and making an admin "Confirmed" resolution of a `permanently_dead` flag set `is_active = false`.

## 7. Scheduling the push sender (report fix 22)

Nothing invokes `supabase/functions/push-sender`; queued notifications sit unsent unless someone calls it by hand, and the function marks rows sent even when the Expo call fails. Needs infra: a `pg_cron` + `pg_net` HTTP call, a Supabase scheduled function, or an external scheduler, plus receipt handling.
Recommendation: pg_cron + pg_net every minute, and change the function to only mark rows sent on a 200 from Expo.

## 8. Forgot password (report 1.9 remainder)

There is no password recovery at all. `resetPasswordForEmail` needs a redirect URL, a deep-link route, and a new-password screen; the redirect URL choice depends on whether universal links will exist (see 10).
Recommendation: implement with the `openmic://` custom scheme now; revisit when web links exist.

## 9. Timezone derived from the venue pin (report 4.1 remainder)

The form now has a visible timezone picker defaulting to the device zone. Auto-deriving from the venue coordinates needs a lat/lng to IANA lookup dependency (for example `tz-lookup`, MIT, small).
Recommendation: add it; keep the picker as the visible override.

## 10. Server-side is_active and freshness in mics_near (report trust findings)

Paused listings are now filtered client-side and stale listings are still not downranked. Doing both properly (a `where s.is_active` predicate and a freshness term in the ordering) means a migration replacing `mics_near`.
Recommendation: one migration doing both, ordered by next-night day, then freshness tier, then distance.
