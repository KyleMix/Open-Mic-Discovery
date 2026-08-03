# Decisions: resolved 2026-08-03

Every item from the original list was decided by the owner and implemented on
`ux-fixes`, with one deliberate deferral. Record of the choices:

1. **Cancellation notifications: built.** New `occurrence_cancelled` outbox
   kind plus a trigger on occurrence status changes; performers on the list
   get a push carrying the cancellation note (migration 20260803000100).
2. **Walk-in signups: guest_name column.** `signups.performer_id` is nullable
   with a `guest_name` alternative (exactly one set), producer-only RLS for
   guest rows, no notifications to guests, and an "Add a walk-in" field on
   the night roster (migration 20260803000200).
3. **Spot counts: anonymous RPC.** `signup_counts(occurrence_id)` returns
   taken versus capacity, no names; the signup card shows "7 of 15 spots
   taken" with a waitlist warning when full (migration 20260803000300).
4. **Blocked users: view built.** `blocked_profiles` shows a blocker, and
   only the blocker, the handle and name behind each block; Settings uses it
   (migration 20260803000400).
5. **Attendance trigger: deferred by choice.** The signups-based My nights
   history covers the need; revisit alongside manual backfill entries.
6. **Trust loop: full version.** Open-flag dedupe index; admin-confirmed
   "this mic is dead" flags pause the listing and notify the owner (via the
   new `resolve_flag` RPC the admin screen now calls); confirm nudges at 30
   and 60 days unconfirmed; auto-pause at 90 days after two ignored nudges;
   daily cron (migration 20260803000500).
7. **Push sender: scheduled with receipts.** A vault-configured invoker runs
   every minute via pg_cron plus pg_net, and the function no longer marks
   failed Expo batches as sent (migration 20260803000700). Owner setup:
   create the `push_sender_url` and `push_sender_token` vault secrets, per
   the migration header.
8. **Forgot password: built** with the `openmic://` scheme: request screen,
   deep-linked reset screen with code exchange, and an auth-gate exception
   for the recovery session. Owner setup: add `openmic://reset-password` to
   the hosted project's auth redirect list (local config already has it).
9. **Timezone from the pin: built.** `tz-lookup` derives the zone from the
   venue coordinates; the visible picker remains and a manual pick wins.
10. **mics_near: both.** Paused listings are excluded server-side and
    results rank by soonest night, then freshness tier, then distance; the
    client sort mirrors it (migration 20260803000600).

All migrations were verified end to end on a local Postgres via
`scripts/db/verify-local.sh`: 150 pgTAP tests pass, 22 of them new in
`supabase/tests/ux-decisions.test.sql`.

# Open decisions: user-friendliness fix run, 2026-08-03

New items from the `user-friendliness-fixes` branch. Each ships with a
working placeholder so nothing blocks; the decision swaps a value, not a
design.

11. **Support inbox address.** The app now has a working support path
    (Settings > Help > Contact support, and the rejected-listing note on
    the Manage screen). Both open a mailto to `SUPPORT_EMAIL` in
    `src/lib/support.ts`, currently the placeholder
    `support@openmicfinder.app`. Decision: the real address and who reads
    it. Recommendation: a shared inbox on the product domain, not a
    personal address, so App Store review and users see a stable contact.
12. **Stewardship badge on discovery cards.** The mic detail screen now
    shows "Verified host", "Host-managed", or "Community-listed" beside
    the freshness badge, from `owner_id` plus `producer_public.verified`.
    Discovery cards do not, because `mics_near` and `search_mics` do not
    return `owner_id`; adding it is a migration touching both functions.
    Recommendation: add it once verified hosts exist in real data; today
    it would label nearly every card "Community-listed". Note there is
    still no admin path granting `producer_profiles.verified`; that flow
    needs its own design.
