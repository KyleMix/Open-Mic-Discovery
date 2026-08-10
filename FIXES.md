# Audit fix log

Running log for the 2026-08-10 full application audit (Phase 4, option C: fix everything).
Finding numbers reference the audit report delivered in this session. Owner gates decided:
all additive migrations approved; "host" wins over "producer" in user-facing copy; blocking
filters a blocked host's mics out of discovery; running the draw closes signups for that night.

Status: `pending`, `in progress`, `done <commit>`, `logged only` (console-side or owner step).

## Baseline

| # | Finding | Files | Change | Status |
| - | ------- | ----- | ------ | ------ |
| 0 | Inherited pgTAP failures from the share feature (bare is_admin() in the new policy; test assumed RLS filtering where the privilege is revoked) | supabase/migrations/20260810000300_share_events_initplan.sql, supabase/tests/share-events.test.sql | alter policy wraps is_admin in a scalar subquery; test asserts 42501 on update/delete | done a20f3a9 |

## P0

| # | Finding | Files | Change | Status |
| - | ------- | ----- | ------ | ------ |
| 1 | Walk-in reorder/redraw fails permanently (slot-move trigger inserts null profile_id) | supabase/migrations | Null guard in queue_slot_move_notification + pgTAP (walk-in-slot-moves.test.sql) | done 33fd7e9 |
| 2 | Post-draw entrants stuck "In the draw"; draw allowed while window open | supabase/migrations, signups feature | Draw closes signups for the night: server (c05771e) and client card/footer drawn states | done |
| 3 | Mic page swaps to next week at showtime; slot/on-deck vanish | src/features/discovery/queries.ts, src/app/mic/[id].tsx | Include in-progress occurrence (4h trailing cutoff matching the Going tab) and skip completed nights; nextOccurrence helper + tests | done f77d7c7 |
| 4 | Offline: error branch hides persisted cache; AuthGate replaces app with error screen | src/lib/query-client.ts, src/app/_layout.tsx, tab screens, mic/[id] | Branch on error-and-no-data (six screens); gate blocks only when nothing cached and lets a failed EULA check through; banner mounted globally; onlineManager/focusManager wired to expo-network/AppState | done 0190d46 |
| 5 | Cold-start deep link has no back stack or tabs | src/app/_layout.tsx | unstable_settings anchor (tabs) | done 686f338 |
| 6 | Onboarding is a trap; partial failure gives unwinnable handle error | src/app/(auth)/onboarding.tsx, src/features/auth/api.ts | Sign-out escape button; EULA redirect when the in-memory acceptance is gone; profile pre-check + upsert-on-conflict make resubmits safe | done 061bac9 |
| 7 | Pause/cancel/restore/resume report success on refused writes | src/features/producer/queries.ts | Zero-row checks on pause/cancel/restore/resume + denied-writes coverage | done d6954ef |
| 8 | Producer management screens unguarded for non-owners | src/app/producer/*.tsx | canManageSeries mirrors the RLS predicate; NotYourMic state on manage/night/live/analytics/credits; host-role prompt on new | done c67f9ea |
| 9 | Restore night / resume listing errors never rendered | src/app/producer/[id].tsx | Render pause/resume/restore errors on the manage screen; poster DB write awaited into posterError | done d6954ef |
| 10 | auth-callback spins forever for onboarded accounts | src/app/auth-callback.tsx | Navigate on successful exchange (returnTo or tabs); gate still runs the new-account funnel | done aa3b912 |

## P1

| # | Finding | Change | Status |
| - | ------- | ------ | ------ |
| 11 | Join 42501 blanket-mapped to "not open" | Join 42501 now passes the draw contract message through and names both remaining causes with a support pointer | done |
| 12 | Sanctions never surfaced in app | Sanction banner with reason/expiry | pending |
| 13 | Lottery spots-left misinformation pre/post draw | drawEntrantsLabel pre-draw, drawnSpotsLabel post-draw, first-come copy unchanged; footer gets drawDone | done |
| 14 | Spots/counts never update live on mic page | Spots/counts poll every 20s while the window is open (RLS keeps other entrants' rows out of realtime); roster events also refresh spots | done |
| 15 | Roster misses withdrawals (replica identity) | 20260810000600: replica identity full + mic_series/mic_occurrences added to the realtime publication, pgTAP pinned | done |
| 16 | Live screen says nobody signed up on undrawn lottery | Live screen names the undrawn draw and links to the list screen; test added | done |
| 17 | Withdraw Undo post-draw limbo + wrong copy | Withdraw confirm copy branches by method and draw state; undo rejoin explains a draw that ran in the meantime | done |
| 18 | Series delete/unapprove silently erases Going entries | Soft-delete or rejection cancels committed future nights (existing cancellation push carries it); pause untouched by design | done |
| 19 | Start-time change never notifies signed-up performers | occurrences_notify_time_change queues a mic-local notice for active signups | done |
| 20 | Cancelled next night invisible on cards | search_discover returns cancelled_next_starts_at; MicCard renders a danger line; favorites carry it too; pgTAP discovery-truth | done |
| 21 | anchor_date never re-sent; parity picker hidden in edit | Show picker in edit mode; send anchor in patch | pending |
| 22 | Rule change orphans off-pattern nights invisibly | Mark off-pattern nights in Upcoming nights | pending |
| 23 | Name search hard-bounded by radius | Text queries send no radius (distance decay ranks); radius recovery is browse-only; zero-results copy stops blaming the radius | done |
| 24 | .or() interpolation 400 on comma/paren | Escape filter values in venue + person search | pending |
| 25 | Producer edits invisible to viewing performer | useMicDetail subscribes to the viewed series' occurrences and series row; focusManager (item 4) covers foregrounding | done |
| 26 | Cancel/pause does not invalidate favorites/Going | useInvalidateSeries also invalidates plan and favorites | done |
| 27 | Blocking does not hide a blocked host's mics | search_discover filters mics whose owner is in a block pair with the caller (enrichment phase, pgTAP proves blocker/guest asymmetry) | done |
| 28 | Report-modal block + Settings unblock fail silently; blocked/banned rows render "Performer" | Render errors; stable roster fallback label | pending |
| 29 | Admin mutations silent; Actioned leaves content live; no target preview; held credits unapprovable | Render errors; Actioned moderates target; show target; credits leg in queue | pending |
| 30 | Claim review silent failure; claims/next-nights lack states | Render states | pending |
| 31 | Read-only admins locked out of admin screen | Gate reads on is_admin_reader; hide action buttons | pending |
| 32 | Reset-password yanked by gate | Exempt reset-password in both gate branches | pending |
| 33 | No AppState auth refresh wiring; refresh failure unhandled | startAutoRefresh wiring; redirect on session loss | pending |
| 34 | Guest deep links spin forever on admin/test-kit/edit-profile; test-kit headerless | Session check first; ScreenHeader in all branches | pending |
| 35 | No +not-found route | Styled +not-found.tsx | pending |
| 36 | Association-file placeholder values pass the guard tests | Tests reject TODO placeholders (deploy step remains owner's) | pending |
| 37 | Map showsUserLocation fires OS prompt out of context | Gate on granted permission | pending |
| 38 | Failed headcounts render as zeros | "count unavailable" on error | pending |
| 39 | Producer role off with live listings silent; role updates lack zero-row checks | Warn when owning series; zero-row checks | pending |
| 40 | Walk-in cannot be removed | Wire useRemoveWalkIn to roster row | pending |
| 41 | Draw the lottery vs Name draw; hardcoded CTA; host vs producer | Name draw everywhere; CTA_LABELS; host wins (gate) | pending |

## P2

| # | Finding | Change | Status |
| - | ------- | ------ | ------ |
| 42 | Performer can delete performed/no_show rows via API | Status guard on delete policy (migration) | pending |
| 43 | Draw losers get generic waitlist wording | requested-to-waitlisted worded as losing the draw | done |
| 44 | Window close never re-rendered; paused listing reads live; no signup trace on cancelled night | Arm close timer; paused banner from is_active; card note | pending |
| 45 | Recurrence: -2FR renders "Schedule varies"; clumsy multi-ordinal English; biweekly preview parity; today's night not retimed; override_venue_id dead | Extend ORDINALS; join ordinals; preview first date; document retime; render override venue | pending |
| 46 | Tonight quick-pick device-tz after browseNear; AM/PM hardcoded; profile history + analytics dates lack timezone | Center-tz window; shared Intl formatting; eventDate with timezone | pending |
| 47 | free-token strips names; multi-day tokens drop; guest area note suppressed | Adjacency check; accumulate days; fix pending-gate | pending |
| 48 | Missing retries; producer not-found vs error; analytics zero totals; null-on-error subcomponents | Add retry/error states | pending |
| 49 | Return-to family (dup stack, dropped params, inert guard, unguarded back, push verb, swallowed signOut, bare /open-mics) | Fix each | pending |
| 50 | Copy: slot/spot, listing/mic, event history, ellipses, My Mics case, screen self-naming, method label maps scattered | Standardize; labels consolidated | pending |
| 51 | Styling/components: duplicate ConfirmSheet, maxFontScale coverage, sheet shells, empty states, scrim/radius/fontSize/gap tokens, brand hexes, claim glyph | Tokens + shared components + sweep | pending |
| 52 | Dead code: center.ts, timezones.ts, links.ts, unused exports, buttonPressed, expo-file-system | Wire the better copy or delete; drop dependency | pending |
| 53 | Config: AGE_SIGNAL undocumented, Maps key in app.json, ascAppId placeholder, token mirrors, stale FINDINGS.md | Document/annotate/correct | pending |
| 54 | Delete-account leaves persisted cache; favorite toggle silent | Clear cache on delete; toast on favorite error | pending |

Console-side findings (no console repo exists yet) are logged in the report only, per constraints.
