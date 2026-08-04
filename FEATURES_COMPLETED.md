# Top-4 features: what shipped (2026-08-04)

Branch `top-features`, based on `user-friendliness-fixes` (the fix run's
primitives live there, not on `main`, which has diverged with independent
work; see the note at the bottom). One commit per feature, each passing
`npm run typecheck`, `npm run lint`, and `npm test`. Test count went from
121 to 140. The support address in DECISIONS_NEEDED item 11 is still the
placeholder, so it was left untouched.

## 1. Relative "Tonight" dates

**Behavior.** One formatter (`src/features/discovery/date-label.ts`) with
the full ladder: Tonight or Today (same night, with time), Tomorrow (next
night, with time), "This Friday" (two to six nights out), then absolute
dates. The night rule, chosen deliberately and documented in the file: a
night runs until 5 AM, and both "now" and the event are attributed to the
evening their night began. So a 12:30 AM mic is still Tonight to someone
browsing at 11 PM, and stays Tonight at 12:01 AM until it starts. Days
flip on the venue's midnight (IANA zone from the series), with device
fallback.

**Primitives consumed.** `formatInZone` for all zone math; existing
consumers of `formatNextDate` kept their import paths.

**Sweep.** 11 sites render through the formatter: discovery cards, search
rows, favorites, detail Next line, profile upcoming rows (from the fix
run), plus manage-screen night rows, the this-night modal title ("Cancel
Tonight?"), the night screen header, the producer dashboard next line
(its hand-rolled Tonight logic deleted), and the signup card's night
label and opens date. Two `toLocaleDateString` sites remain by design:
analytics and profile history are past dates, where "Tonight" would lie.
Grep: `grep -rn "toLocaleDateString" src --include='*.tsx'` returns
exactly those two.

**Manual test.** Open Discover with a mic later today: card reads
"Tonight · 8:00 PM". Set the device clock past midnight before a 12:30 AM
mic: still Tonight. A mic three days out reads "This Thursday"; ten days
out reads "Tue, Aug 14".

## 2. Sticky signup CTA, every state

**Behavior.** The mic detail footer stays persistently visible for every
signable night: guest sees "Sign in to get on the list"; an open window
shows the join action with a spots-taken line; a full night flips the
button to "Join the waitlist" with "Full · N of N spots taken"; a
not-yet-open list reads "Signups open This Friday"; a closed list says so
with the walk-up hint; once signed up it shows the performer-voice status
with slot ("On the list · Slot 3"). Host-booked and cancelled nights,
missing performer role, and in-flight lookups render nothing. If the
window opens while the person is on the screen, a timer re-renders at the
opening instant and announces "Signups are open for Tonight."

**Primitives consumed.** Shared label maps (new strings added to
`signups/labels.ts`, nothing inlined), performer-voice STATUS_LABELS,
`formatRelativeDay`, the 44pt Button, safe-area insets, the established
announcement pattern, `accessibilityLiveRegion` on status rows.

**Manual test.** On a phone-width window, open a mic with an open list:
the button sits above the home indicator and the last card scrolls fully
above it. Sign up: the footer becomes "On the list · Slot N". Open a mic
whose list opens in under a minute and wait: the footer flips and
VoiceOver announces it.

## 3. Stewardship badges on discovery cards (migration proposed, gated)

**Behavior.** Cards show "Host-managed" or "Community-listed" in the meta
row, only once the discovery RPCs return `owner_id`. The migration that
adds it, `supabase/migrations/20260804000100_discovery_stewardship.sql`,
is committed but NOT applied (it drops and recreates `mics_near` and
`search_mics` because a return type cannot change under CREATE OR
REPLACE; all else verbatim). `cardStewardship()` probes the row for the
field and returns null when absent, so pre-migration cards show no badge
at all, never a placeholder. Logged as ready-to-apply in DECISIONS_NEEDED
item 12 with the post-apply step (regenerate types).

**Primitives consumed.** The detail screen's badge, extracted into the
shared `StewardshipBadge` component both surfaces now use: identical
wording, colors, and accessibility labels. Card variant is caption-size
`textSecondary` (7.64:1 on `bgElevated`, contrast-asserted by the tokens
test); the meta row wraps at 375pt rather than shrinking.

**Manual test.** Pre-migration: cards show three meta items and no badge.
Apply the migration in a dev database and reload: claimed mics show
"Host-managed", unclaimed "Community-listed"; the mic name and time still
lead the card.

## 4. Toast-with-undo

**Behavior.** The single shared toast holds 8 seconds when an action is
attached (plain toasts 4), keeps its screen-reader announcement, gains a
44pt keyboard-focusable dismiss control, and still shows one toast at a
time. Three destructive actions now offer Undo that reverses the real
mutation: dropping a slot re-inserts the signup (at the end of the list,
as the withdraw copy promises); cancelling a night restores the scheduled
status and clears the note (the confirmation sheet stays in front; the
toast comes after); pausing a listing, this app's remove-a-listing action
(true delete is missing-features item 12 and out of this run's scope),
sets it active again. Undo failures surface action-specific plain
language through `userError`: a closed window says "signups closed for
this night", and raw database text cannot reach the toast.

**Primitives consumed.** The existing ToastProvider (extended, not
replaced), `userError`, `minTouchTarget`, dedicated hooks
(`useCancelNight`, `usePauseSeries`, the extended `useWithdraw`) so
screens stay thin and reversal is testable.

**Reversal tests.** 6 in `src/features/undo.test.tsx`: withdraw undo
re-inserts `{occurrence_id, performer_id}`; cancel undo patches
`{status: 'scheduled', cancellation_note: null}` (guarded to
still-cancelled rows); pause undo patches `{is_active: true}`; plus one
failure-wording test per action. 3 more in `toast.test.tsx` cover the 7
second floor, single-toast replacement, and undo/dismiss behavior.

**Manual test.** Withdraw from a list: toast offers Undo for 8 seconds;
tapping it puts you back on and confirms. Cancel a night through its
confirmation: the toast's Undo restores it (the row loses its strike
through). Pause a listing: Undo brings the schedule back. Let a toast
sit: it dismisses itself; the X dismisses it sooner.

## Repository note

`origin/main` does not contain the user-friendliness fix run and has
moved independently (Live mode, payments removed, onboarding changes).
This branch stacks on `user-friendliness-fixes` because the primitives
these features are required to reuse exist only there. Merging either
branch into `main` will need a reconciliation pass.
