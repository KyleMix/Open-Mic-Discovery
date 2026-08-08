# Manual QA script: both roles, end to end

A hand-runnable pass covering everything a store reviewer or tester can
reach. Run it on a preview build against the hosted backend before every
submission, once on iOS and once on Android. The seeded demo accounts are
in `REVIEW_NOTES.md`; the in-app test kit (tester accounts only, Profile
tab) can rebuild any scenario listed in `docs/TEST_KIT.md`.

Automated coverage backing this script: 493 Jest tests, 708 pgTAP
assertions, and three Maestro flows (discovery, signup, reviewer cold
start) in CI. This script exists for what automation cannot judge: real
devices, real network, and whether a screen reads sanely.

Conventions: every step names an expected result. A step with no tick box
of its own inherits the section's. Steps marked [iOS] or [Android] run on
that platform only.

## 1. Cold start, empty account (reviewer path)

1. Install fresh, aeroplane mode ON, launch. Expect: app opens, Discover
   renders with an offline banner and cached-or-empty state, no crash, no
   infinite spinner.
2. Aeroplane mode OFF. Expect: banner clears, Seattle-area seeded mics
   appear with a visible note that this is a fallback area until location
   or home area is set.
3. Browse as a guest: open a listing, open the map, use search. Expect:
   everything readable, no sign-in wall for reading.
4. Tap Favorite on a listing as a guest. Expect: a sign-up prompt, not a
   crash and not a silent no-op.
5. Sign up with a fresh email. Expect: EULA gate first (scroll and accept),
   then onboarding: handle, display name, birth year, home area, role
   selection.
6. Enter a birth year under 18. Expect: refused with plain copy, server
   enforced (retrying via a modified client would also fail).
7. Pick performer role only, finish. Expect: land on Discover with tabs
   Discover, Favorites, Going, My Mics, Profile.

## 2. Auth flows

1. Sign out (Profile, Settings, Sign out). Expect: back to guest browse.
2. Sign in with the wrong password. Expect: a human error message, form
   stays filled.
3. Forgot password: request a reset for the demo performer address.
   Expect: confirmation copy; the email arrives (hosted SMTP must be
   configured); tapping the link deep-links into the reset screen; a new
   password signs in.
4. [iOS] Sign in with Apple on the sign-in screen. Expect: native sheet,
   account created or signed in, no email shown publicly anywhere.
5. Sign in with Google. Expect: browser flow returns to the app signed in.
6. Kill and relaunch the app. Expect: still signed in (session refresh).

## 3. Performer: discover to performed

Use `performer@demo.openmicexplorer.local`.

1. Discover list: filter by discipline, day, Free only, and radius.
   Expect: chips reflect state, results change, chips dismissible.
2. Search "open mic tonight". Expect: the token becomes a Tonight chip;
   text query is "open mic".
3. Map view: markers cluster; tapping a cluster zooms; tapping a pin opens
   the card. VoiceOver/TalkBack: markers announce names.
4. Open a listing with signups open. Expect: card shows spots taken and
   cost honestly; Add to my calendar asks write-only calendar permission;
   denying the permission produces guidance, not a dead end.
5. Sign up. Expect: instant confirmation with slot number, receipt row in
   Going tab, push token registered (prompt is a primer, not an ambush).
6. Sign up for a full mic. Expect: waitlist position shown, not an error.
7. Cancel the signup. Expect: confirmation asks first; undo toast offered.
8. Report the listing (Report abusive content). Expect: reasons list,
   optional detail, submits, offers blocking the host.
9. Block the host. Expect: their listings vanish from Discover, Favorites,
   and search immediately; Settings shows the block with an unblock path.
10. Unblock. Expect: content returns.

## 4. Producer: list to run a night

Use `producer@demo.openmicexplorer.local`.

1. My Mics, create a listing: name, venue (pin picker geocodes; timezone
   derives from the pin), plain-language recurrence ("Every Tuesday,
   8pm"), signup method, capacity, cost. Expect: preview text describes
   the schedule back in words before saving.
2. Type profanity into the description. Expect: the listing saves but is
   held for review rather than going live (server-side filter), with
   honest copy about why.
3. Save a clean listing. Expect: it appears in Discover for another
   account within a refresh.
4. Edit the listing; abandon an edit with back. Expect: discard guard
   asks before losing changes.
5. Upload a poster. Expect: appears on the listing card and detail.
6. Confirm freshness (one tap). Expect: "confirmed today" on the public
   card.
7. Night screen on a seeded night: add a walk-in by name, draw the
   lottery (if lottery method), reorder the list, mark performed and
   no-show. Expect: order updates live on a second device signed in as
   the performer.
8. Cancel a night with a reason. Expect: performers on the list get a
   push naming the reason.
9. Pause the listing. Expect: it leaves Discover; My Mics shows it paused
   with a resume path.

## 5. Dual role

Use `dual@demo.openmicexplorer.local`. Switch between performing (sign up
for someone else's mic) and producing (manage your own) in one session.
Expect: no role confusion in tabs, headers, or pushes.

## 6. Moderation loop (admin)

Use `admin@demo.openmicexplorer.local` and a second device or account.

1. From the performer account, report a listing.
2. Admin: Profile tab shows a Moderation entry; the queue lists the
   report with reason and severity.
3. Take the content down. Expect: it disappears from the reporter's
   Discover within a refresh; the owner sees a rejected state with
   support contact copy; the report resolves.
4. Verify (SQL editor or console when built): `admin.audit_log` gained
   rows for the takedown and the resolution naming the admin
   (`supabase/tests/moderation-audit.test.sql` automates the same
   assertions).

## 7. Account deletion

On a throwaway account with a signup and an avatar:

1. Settings, Delete account. Expect: consequences stated, confirmation
   required, then signed out to guest.
2. Sign in with the deleted credentials. Expect: refused.
3. Verify the avatar file is gone and the profile row is anonymized
   (pgTAP: `supabase/tests/deletion.test.sql` proves both paths).
4. Web path: `stonedgoose.com/openmic/delete-account`, request a link for a
   second throwaway. Expect: email arrives; the flow deletes the same way.

## 8. Robustness and accessibility sweep

1. Slow network (Network Link Conditioner / throttling): Discover shows
   skeletons, then content; no spinner lives forever; failed loads show
   retry.
2. Deny location permission. Expect: fallback area with an explanation
   and a path to settings; the map still works.
3. Deny notification permission. Expect: signups still work; the primer
   does not re-ambush on every launch.
4. Dynamic type at the largest setting: onboarding, listing detail, and
   the night screen stay usable; nothing truncates into meaninglessness.
5. VoiceOver/TalkBack: tab bar, listing cards, signup button, report and
   block controls all announce role and label.
6. Keyboard: forms scroll to the focused field; the keyboard never covers
   the submit button (create listing and edit profile are the worst
   cases).
7. Background the app mid-signup, return. Expect: state intact.
8. [Android] System back from every tab and modal: never exits the app
   unexpectedly, never traps.
9. [iOS] Swipe-back from listing detail and modals behaves.

## 9. Deep links

1. Open `https://stonedgoose.com/openmic/mic/<seeded-id>` (domain must be
   deployed with the association files). Expect: app opens to the
   listing, cold or warm.
2. `openmicexplorer://` scheme links (from a messaging app) resolve.
3. Password-reset link lands on the reset screen even when signed out.

## 10. Pre-submission smoke (production build)

On the actual store-track build (TestFlight / Internal testing):

1. Sections 1, 3 steps 4 to 6, 4 steps 1 and 3, 6, and 7 pass against
   the production backend.
2. No debug UI is reachable: the test kit entry is absent for non-tester
   accounts (server gated, off by default).
3. `REVIEW_NOTES.md` demo credentials work on the production backend.
4. Sentry receives a forced test error from the production build and
   nothing else about normal browsing.
