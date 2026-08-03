# UX review fixes: what changed

Branch `ux-fixes`, one commit per fix or tightly related group. Every commit passed `npm run typecheck`, `npm run lint`, and `npm test` (97 tests at the end, up from 84; new suites cover the date-window bound, the EULA renderer, and venue-timezone formatting). No schema or migration changes were made; everything below is client code. Items needing migrations, infra, or product calls are in DECISIONS_NEEDED.md.

## Blockers

- **Anonymous browsing (1.1/5.1).** The auth gate now lets guests into the tabs and mic detail; the database already allowed it and the app's signed-out branches (favorites, My Mics, signup, flag, claim, report) were dead code that is now live. Added a signed-out Profile state, a "Browse mics without an account" path on sign-in, and a guest favorite star that prompts sign-in.
- **Tonight means tonight (1.2).** The Today/Weekend chips (renamed "Tonight" and "This weekend") additionally bound results to the actual date window client-side, with tests. Cards show the recurrence pattern and the concrete next date together. Known limit documented in code: a series whose next night precedes the weekend hides under "This weekend" even if it also runs weekends; the full fix is an RPC change (DECISIONS_NEEDED 10).
- **Timezone hardcode (4.1).** New listings no longer silently get America/Los_Angeles; the form has a visible timezone picker defaulting to the device zone, editable on existing series (the reconcile trigger recomputes starts_at). Pin-derived lookup deferred (needs a dependency).
- **Performer history (2.1).** Profile now shows "My nights": upcoming signups, a played count, and recent past nights, built from the performer's own signups. attendance_log stays unused (DECISIONS_NEEDED 5).
- **Place plus date search (3.1/3.2/3.5).** A "Near {place}" label names the browse center with a back-to-home reset; any search offers "Show mics near" that geocodes the text into the filtered nearby view (also from the previously dead-end empty state); a banner announces the Seattle default when no home coordinates exist.
- **Night-of usability (4.2 partial).** Roster header names the mic and date; no-show and re-draw require confirmation; reorder failures surface; free producers no longer see a flash of the paid controls; My Mics cards show the next night and signup count with a one-tap "Open tonight's list". Walk-in add needs schema (DECISIONS_NEEDED 2); drag reorder stays chevrons per the documented Reanimated constraint in ARCHITECTURE.md.

## Quick wins (report fixes 1 to 14)

1. Per-night title and cost overrides render on the mic page, in the signup card's paid-slot line, and in the calendar event.
2. `signup_opens` initializes from the row and survives series edits (was silently discarded).
3. Push notifications deep-link to the mic they are about, from cold start and foreground.
4. Filters, radius, discipline selection, and list/map view persist across launches (day picks and date bounds stay session-only by design; yesterday's "tonight" would mean the wrong day).
5. Cancellation notifications: NOT done, needs a migration (DECISIONS_NEEDED 1).
6. Error surfaces and confirms: confirm-accurate failures show on both producer screens; withdraw asks for confirmation, explains slot loss, and surfaces errors; reorder errors render; pause warns before deleting upcoming nights.
7. Venue phone and website buttons (un-dead-ends invite-only mics), "Parking:" label, "Sound system" instead of "PA", "Wheelchair access" instead of "Accessible", "Spots" shown as total capacity, mic name in the previously blank nav header.
8. Favorite star on discovery cards (one shared query, not per-row); Favorites shows each mic's next date, sorts soonest first, disables the unstar while pending, and surfaces toggle failures.
9. Covered under the Tonight blocker above.
10. Search debounced 300ms with previous results kept on screen; freshness badge added to search rows.
11. The signed-in non-performer signup dead end now offers a one-tap "I perform: turn it on".
12. Email-confirmation signups show "Check your email" instead of doing nothing; the 10-character password rule is stated up front.
13. Settings jargon fixed; blocked-user names still need a view change (DECISIONS_NEEDED 4).
14. The EULA renders as headings, bullets, and paragraphs instead of raw markdown, and the accept button drops the version number. The push permission prompt moved from first sign-in to the first signup, first favorite, or enabling a notification preference; launch only refreshes tokens already granted.

## Majors beyond the quick wins

- Performer-side realtime: the signup card updates live when the host draws, promotes, or puts them on deck (2.5).
- Listings held by the moderation filter tell their creator: "In review" tag on My Mics, full explanation (and a rejected state) on Manage (4.5).
- Analytics bounded to past nights so totals stop counting future zero-signup rows (4.7).
- Series venue can be changed on edit to another listed venue; new-venue creation stays create-mode only, and one-night venue overrides still need wiring (4.4).
- Mic page times (next night, doors, cancellations, signup night label) format in the venue's timezone, with a note when it differs from the device (3.4).
- Paused listings drop out of discovery client-side and explain themselves when opened directly.
- Status copy: hints for "In the draw", "Waitlisted", and "no-show"; clearer "drawn" and slot labels; card accessibility labels now speak the day, cost, method, and freshness.

## Decision batch (added 2026-08-03, after owner sign-off)

All ten DECISIONS_NEEDED items were decided and implemented in a second pass
(see DECISIONS_NEEDED.md for the record): cancellation notifications, walk-in
guest signups with roster UI, anonymous spot counts on the signup card,
blocked-user names in Settings, the full trust loop (flag dedupe, dead flags
pausing listings, confirm nudges, 90-day auto-pause), scheduled push sending
with receipt handling, forgot-password recovery, pin-derived timezones, and
server-side is_active filtering plus freshness-aware ranking in mics_near
(mirrored client-side). The attendance_log trigger was deferred by choice.
Migrations verified with 150 passing pgTAP tests on a local Postgres.

Owner setup required to activate two of them in production: vault secrets
`push_sender_url` and `push_sender_token` for the push schedule, and
`openmic://reset-password` in the hosted auth redirect list.

## Skipped, with reasons
- Map callouts, marker accessibility labels, and region-driven refetch: a map-view rework beyond a per-fix change; the list is the primary surface. Recommend as its own task.
- Drag-to-reorder: blocked on New Architecture-compatible drag libraries per ARCHITECTURE.md; the chevrons remain.
- Poster remove action, duplicated screen headings, keyboard avoiding views on auth forms, claims queue relocation into /admin: low-severity polish left untouched to keep the diff reviewable; none is riskier than a small follow-up.

## Follow-up recommendations

With the decision batch landed, the remaining follow-ups are: the map-view
rework (callouts, marker accessibility, region-driven refetch), drag
reorder when a New Architecture-compatible library stabilizes, the deferred
attendance_log trigger with manual backfill, shareable listing pages (the
top item on the feature roadmap in docs/UX_REVIEW.md), and the two owner
setup steps listed above.
