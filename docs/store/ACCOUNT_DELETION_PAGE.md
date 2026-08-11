# Account Deletion Page (pointer to the shipped page)

Reconciled 2026-08-11. An earlier version of this file carried its own
hostable copy for an "Open Mic Finder" page with an email-us,
delete-within-7-days flow. That flow was never shipped and this document
no longer competes with the real page. The shipped deletion story is
self-service and immediate, and the canonical sources are:

- The page itself: `web/delete-account/index.html`, deployed at
  `https://www.stonedgooseproductions.com/open-mics/delete-account/`
  (use the trailing-slash form in store forms; it answers 200 directly).
- The backend: Edge Function `supabase/functions/deletion-request`.
- The form answers referencing it: `docs/store/DATA_SAFETY_ANSWERS.md`.
- Deploy steps and the verification curl: `docs/DEPLOY_WEB.md`.

## What the shipped flow actually is

Google Play requires a public web page where users can request account
deletion without reinstalling the app (Play Console: App content, Data
deletion). Apple reviewers also look for an out-of-app deletion path.
The shipped page satisfies both:

1. The visitor enters the account email. The Edge Function sends a
   confirmation link to prove address ownership. No password needed.
2. The link returns to the page, the visitor ticks an "I understand"
   confirmation, and deletion runs immediately: the sign-in is
   hard-deleted (the email is freed for re-registration) and the profile
   is anonymized.
3. In-app, the same deletion is two taps from the settings root:
   Profile tab, Settings, Delete account.

What is retained, exactly as the page states: anonymized signup and
lineup history rows (they point at a blank "Deleted user" record) and
moderation records, unlinked from identity. There is no subscription or
billing history to mention anywhere: the app sells nothing and contains
no payment SDK.

## Owner setup reminders

- The deployed page reads its endpoint from the `data-function-url`
  attribute on `<body>`. Until it is set to the real
  `https://<project-ref>.supabase.co/functions/v1/deletion-request`, the
  form disables itself and says so. Set it at deploy time (launch
  checklist step 7 / audit blocker B2).
- The support address on the page must match `SUPPORT_EMAIL` in
  `src/lib/support.ts` (currently kyle@stonedgooseproductions.com).
