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
| 2 | Post-draw entrants stuck "In the draw"; draw allowed while window open | supabase/migrations, signups feature | Draw closes signups for the night (server side done: lifecycle refusal with named reason, post-draw walk-ins land via confirm-or-waitlist, draw guarded to lottery/scheduled, signup_counts reports entrants and draw_done); client card work tracked with items 13 and 17 | in progress |
| 3 | Mic page swaps to next week at showtime; slot/on-deck vanish | src/features/discovery/queries.ts, src/app/mic/[id].tsx | Include in-progress occurrence (4h trailing cutoff matching the Going tab) and skip completed nights; nextOccurrence helper + tests | done f77d7c7 |
| 4 | Offline: error branch hides persisted cache; AuthGate replaces app with error screen | src/lib/query-client.ts, src/app/_layout.tsx, tab screens, mic/[id] | Branch on error-and-no-data; gate only blocks with no data; banner global; online/focus managers wired | pending |
| 5 | Cold-start deep link has no back stack or tabs | src/app/_layout.tsx | unstable_settings anchor (tabs) | in progress |
| 6 | Onboarding is a trap; partial failure gives unwinnable handle error | src/app/(auth)/onboarding.tsx, src/features/auth/api.ts | Sign-out escape; idempotent completeOnboarding | pending |
| 7 | Pause/cancel/restore/resume report success on refused writes | src/features/producer/queries.ts | Zero-row checks on all four | pending |
| 8 | Producer management screens unguarded for non-owners | src/app/producer/*.tsx | Ownership gate + not-yours state; is_producer check on new | pending |
| 9 | Restore night / resume listing errors never rendered | src/app/producer/[id].tsx | Render both error states | pending |
| 10 | auth-callback spins forever for onboarded accounts | src/app/auth-callback.tsx | Navigate on successful exchange | pending |

## P1

| # | Finding | Change | Status |
| - | ------- | ------ | ------ |
| 11 | Join 42501 blanket-mapped to "not open" | Distinguish causes; honest copy with support path | pending |
| 12 | Sanctions never surfaced in app | Sanction banner with reason/expiry | pending |
| 13 | Lottery spots-left misinformation pre/post draw | Entrant count in counts RPC; per-method copy | pending |
| 14 | Spots/counts never update live on mic page | Occurrence-scoped realtime + invalidate spots/counts | pending |
| 15 | Roster misses withdrawals (replica identity) | alter table signups replica identity full | pending |
| 16 | Live screen says nobody signed up on undrawn lottery | Count requested rows; link to draw | pending |
| 17 | Withdraw Undo post-draw limbo + wrong copy | Branch copy/behavior once draw ran | pending |
| 18 | Series delete/unapprove silently erases Going entries | Cancel future occurrences on delete/unapprove (migration) | pending |
| 19 | Start-time change never notifies signed-up performers | starts_at-change notification trigger (migration) | pending |
| 20 | Cancelled next night invisible on cards | Surface next_status through search_discover + card strike | pending |
| 21 | anchor_date never re-sent; parity picker hidden in edit | Show picker in edit mode; send anchor in patch | pending |
| 22 | Rule change orphans off-pattern nights invisibly | Mark off-pattern nights in Upcoming nights | pending |
| 23 | Name search hard-bounded by radius | p_radius_m null when query present | pending |
| 24 | .or() interpolation 400 on comma/paren | Escape filter values in venue + person search | pending |
| 25 | Producer edits invisible to viewing performer | Realtime on viewed series + focus refetch | pending |
| 26 | Cancel/pause does not invalidate favorites/Going | Add keys to useInvalidateSeries | pending |
| 27 | Blocking does not hide a blocked host's mics | Block filtering in discovery RPCs (migration) | pending |
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
| 43 | Draw losers get generic waitlist wording | Branch notification on prior status (migration) | pending |
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
