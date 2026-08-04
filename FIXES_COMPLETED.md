# User-friendliness audit fixes: what changed (2026-08-03)

Branch `user-friendliness-fixes`, one commit per fix, implementing all 10
recommendations from USER_FRIENDLINESS_AUDIT.md plus the three spine items
(dark-room legibility, error handling and validation, trust surface). Every
commit passed `npm run typecheck`, `npm run lint`, and `npm test` (121 tests
at the end, up from 99). No schema or migration changes; two owner calls are
logged in DECISIONS_NEEDED.md (items 11 and 12) with working placeholders.

## Per-fix summary

1. **Plain-language enums everywhere (audit 1).** Sweep found 4 raw-enum
   render sites: the roster (both Pro and free branches, showing `no_show`
   verbatim) and the moderation queue (report target, report reason, flag
   reason). All render through shared label maps now: new
   `features/safety/labels.ts` and `features/signups/labels.ts` (a
   producer-voice roster map, since the performer-voice STATUS_LABELS says
   "You are in"). The report and flag modals derive their reason lists from
   the same maps so wording cannot drift. Verification grep for
   `\{...\.(status|reason|target_type|...)\}` now returns only prop passing
   and a style name; zero enum values reach a screen.

2. **AA contrast (audit 2).** `textDisabled` #63636E measured 3.31:1 on bg,
   3.03:1 on bgElevated, 2.66:1 on bgPressed. New `textFaint` #8E8E9A
   measures 6.07:1 on bg, 5.56:1 on bgElevated, 4.87:1 on bgPressed, all
   past the 4.5:1 AA floor. Swept 8 of 10 `textDisabled` sites (freshness
   stale/unknown tiers, both placeholders, inactive tab tint, fact labels,
   onboarding glyphs, paywall fine print, cancelled dates); the 2 left are
   the token itself and a genuinely disabled icon, which WCAG 1.4.3
   exempts. The tokens test now asserts every text color against all three
   surfaces so a token change cannot silently regress.

3. **Relative dates (audit 3).** "Tonight · 8:00 PM" (or Today, or
   Tomorrow) on cards, search rows, favorites, the detail Next line, and
   upcoming profile rows; past history stays absolute. Day boundaries and
   the 5 PM tonight/today split are computed in the venue's timezone, with
   7 tests including the fall DST transition and a venue/device midnight
   mismatch.

4. **Central error translation (audit 4).** New `lib/user-error.ts`:
   Sentry gets the raw error, the person gets a mapped message (42501,
   23505, 23503, 23514, PGRST116, network failures) or the caller's
   action-specific fallback, never the raw string. Sweep count: 66 raw
   `new Error(error.message)` sites across 14 files, all replaced; auth
   adds translations for invalid credentials, already registered,
   unconfirmed email, and rate limits. Confirm grep:
   `grep -rn "new Error([^')]*\.message)" src/` excluding tests returns 0.

5. **Sticky signup CTA (audit 5).** The detail screen anchors the one
   primary action ("Sign me up" / "Put my name in the draw" / guest
   sign-in) in a safe-area footer, gone once signed up or outside the
   window. The decision is a pure function with 8 tests written first.

6. **Keyboard avoidance (audit 6).** New FormScreen and KeyboardShift
   primitives; 11 input surfaces covered (4 auth screens, 5 bottom sheets
   with inputs, onboarding, edit profile, and the night screen's walk-in
   field).

7. **Optimistic favorites plus toast acks (audit 7).** The star flips
   instantly with rollback on failure (2 tests) and invalidation is scoped
   to that user's keys. New accessible ToastProvider (announced to screen
   readers, optional action): unfavorite gets Undo, confirm-accurate,
   withdraw, and profile save get visible acknowledgment.

8. **Night-screen glanceability and 44pt targets (audit 8).** Slot numbers
   at heading size in primary text; roster rows stack identity over
   actions so all six controls hold 44pt on a 375pt screen; the Pro branch
   uses the descriptive header; Manage names the mic. Target sweep fixed 4
   sub-44 sites (roster icons, producer-form chips, profile link chips,
   plus wrapping); the card star keeps its 48pt-effective hitSlop and map
   pins were left as marker visuals. Dynamic type: maxFontScale 1.6 token
   applied to every shared primitive, and the two fixed text columns that
   would clip became min-widths.

9. **Screen-reader announcements (spine 1).** On-deck, draw results, and
   status changes are announced on the performer's signup card (realtime
   arrives with no touch to anchor on), and the producer's draw announces
   completion since the shuffle is purely visual.

10. **Trust surface (audit 9).** Stewardship badge on the detail screen
    (Verified host / Host-managed / Community-listed) from `owner_id` plus
    the `producer_public.verified` view. Working support path: Settings >
    Help (contact support, read the terms via the new read-only /terms
    screen) and a live Contact support button on the rejected-listing
    note. Address is a placeholder pending DECISIONS_NEEDED item 11; card
    badges need an RPC migration, logged as item 12.

11. **Unsaved-changes guards (audit 10).** Shared ConfirmSheet,
    DiscardPrompt, and useDiscardGuard (over beforeRemove; the vendored
    navigation lacks usePreventRemove). 7 surfaces guarded: create
    listing, the manage editor (back and Close editor), edit profile, and
    the claim, flag, report, and this-night sheets, including Android
    hardware back. 3 tests.

12. **Inline validation (spine 2).** 19 fields across 7 forms validate on
    blur with clear-on-retype, using the existing pure validators; submit
    checks stay as the backstop. Sign-in email was previously unvalidated
    entirely.

## Contrast before/after (WCAG 2.x ratios, worst surface)

| Text | Before | After |
|---|---|---|
| Freshness stale/unknown label on a card | 3.03:1 (fail) | 5.56:1 |
| Fact labels, fine print, cancelled dates | 3.03:1 (fail) | 5.56:1 |
| Placeholders | 3.03:1 (fail) | 5.56:1 |
| Inactive tab labels | 3.03:1 (fail) | 5.56:1 |
| Same text on pressed rows | 2.66:1 (fail) | 4.87:1 |

## Explicit non-goals honored

The producer cancellation flow keeps its 4th (confirmation) tap, the
dark-first palette was not redesigned (only the failing token gained a
compliant sibling), and the audit's 16-item missing-features list was not
touched.

---

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
