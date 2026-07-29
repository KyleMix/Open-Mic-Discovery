# Usability review: walkthrough by profile

Date: 2026-07-29. Method: a full pass through every screen in the app, four times, each time in the shoes of one of the seeded demo accounts (performer, producer, dual role, admin). Each finding is marked Fixed (shipped in this pass) or Recommended (needs a product decision or backend setup first).

## The dropdown pass

Several fields offered a long row of choices as tap-chips, which sprawled across the screen and forced horizontal scrolling. These now use a shared dropdown control (`SelectField` for one choice, `MultiSelectField` for several, in `src/components/select.tsx`): a labeled input-style trigger that opens a bottom sheet of large tappable options, each with an optional one-line explanation.

Converted:

- Producer form, start time: was 24 hour-chips in a horizontal scroll plus a minutes row. Now two dropdowns (Hour, Minutes) side by side.
- Producer form, how performers get on stage: was 4 bare chips with no explanation. Now a dropdown where each option carries its one-line description (Walk-in list: "Add your name when you get there", and so on).
- Producer form, when signups open: was 5 chips. Now a dropdown with friendlier labels ("1 week before" instead of "7 days out").
- Discover filter sheet, "How you get on stage": was 4 tall toggle rows. Now one multi-select dropdown that summarizes the selection ("Any way" when empty), cutting the sheet's length roughly in half.
- Notification preferences, nearby-alert radius: was a horizontal scroll of buttons. Now a dropdown.

Kept as chips deliberately: short sets of 2 to 7 one-word options where every choice should stay visible and toggling is one tap (disciplines, weekdays, Today/Weekend quick picks, monthly ordinals, distance). Chips beat a dropdown there because nothing is hidden.

## Walkthrough findings

### As a performer

1. Fixed (was a dead end): the signup card on a mic page told non-performers to "Enable the performer role on your profile", but no screen offered that control. It is now a one-tap "Turn on performing" button right on the card, and roles are also editable in Edit profile.
2. Fixed: there was no way to change roles or performing disciplines after onboarding. Edit profile now has a "What you do" section with the same role and discipline toggles onboarding uses; disciplines feed the personalized Discover defaults.
3. Good: signed-out users are never walled off. Discover, mic pages, search, and directions all work; sign-in is asked for only at the moment it is needed (signup, favorite, flag, claim), with a sentence explaining why.
4. Good: every screen has real loading, error (with retry), and empty states, and empty states say what to do next.
5. Recommended: there is no "Forgot password?" on the sign-in screen. Supabase supports email reset, but completing it in-app needs a deep link back into the app, which depends on the hosted project URL configuration. Worth doing before store submission; a reviewer who typoes a password hits a wall today.
6. Recommended: search results show the venue and next date but not distance; adding distance would help pick between two matches.

### As a producer

1. Fixed (data-facing bug): editing a mic showed "When signups open" as 7 days regardless of what the mic was created with, and saving silently dropped the real value. The form now reads the stored interval and saves changes to it.
2. Fixed (no undo): on the night-of list, a fat-fingered tap on "Mark performed" or "Mark no-show" was irreversible; the row's actions vanished. Those rows now show an undo action that puts the performer back on the list.
3. Fixed: the roster showed raw database statuses ("no_show") to free producers and in row metadata. All roster views now use the same plain-language labels performers see ("Marked no-show", "On the list").
4. Good: the recurrence builder reads back the schedule in plain English as you build it, and the this-night-only versus all-future split is explained in both places it applies.
5. Recommended: new listings hardcode the America/Los_Angeles timezone (already documented in REVIEW_NOTES). Fine for the launch region, needs a picker before expansion.

### As a dual-role account

1. Good: one account, both roles, no mode switch. The tabs compose naturally: Discover and Favorites serve the performer side, My Mics the producer side, and the mic page shows the signup card even for mics you run elsewhere.
2. Good: role enablement is symmetric now. A performer can become a producer from the My Mics tab; a producer can become a performer from any signup card or from Edit profile.

### As an admin

1. Fixed: pending claim reviews lived only behind the producer gate on the My Mics tab, so an admin account without the producer role could never see them. The claims queue now shows on that tab for admins regardless of role.
2. Good: the moderation queue is one tap from the Profile tab, groups reports, held content, and data-quality flags, and states the 24-hour target on screen.
3. Recommended: the Settings blocked-user list shows "Blocked user" with no name, because blocking removes the profile from your queries entirely (by design, server side). Consider storing a display-name snapshot at block time so the unblock list is meaningful.

## Checks

`npm run typecheck`, `npm run lint`, and `npm test` all pass (93 tests, including new coverage for the dropdown component, the signup-opens interval parser, and the filter store's method setter).
