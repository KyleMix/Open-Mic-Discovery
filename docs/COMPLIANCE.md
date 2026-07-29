# Compliance Checklist

Maps each store requirement to the implementing code. Living document; updated whenever a listed surface changes.

## Apple Guideline 1.2 (user generated content)

| Requirement                                                                                                 | Implementation                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom EULA prohibiting objectionable content and abuse, affirmative accept, version and timestamp recorded | EULA text: `supabase/migrations/20260728000600_views_and_eula.sql` (eula_versions). Gate: `src/app/(auth)/eula.tsx`. Server-stamped acceptance: `private.guard_profile_writes` in `supabase/migrations/20260728001000_moderation.sql`. Re-accept on new version: `AuthGate` in `src/app/_layout.tsx`.                                                          |
| Report action on every listing and profile                                                                  | Reusable modal: `src/features/safety/components/report-modal.tsx`. Listings: `src/app/mic/[id].tsx` (Report abusive content). Profiles: producer via listing report (block offer), performers via roster rows in `src/app/producer/night/[occurrenceId].tsx`. No comments or reviews exist in v1 (approved at Step 0, Q1).                                     |
| Block action, enforced server side                                                                          | Block writes: `src/features/safety/queries.ts`. Enforcement: `private.is_blocked_pair` filters `public_profiles`/`performer_public`/`producer_public` views both directions, and `private.is_blocked_by_producer` blocks signups (`supabase/migrations/20260728000350_safety.sql`, `20260728000400_occurrences_signups.sql`). Unblock: `src/app/settings.tsx`. |
| Automated first-pass content filter on free text                                                            | `private.text_is_clean` + guard triggers in `supabase/migrations/20260728001000_moderation.sql`; clean text goes live, matches are held as pending. Term list is data (`banned_terms`), admin-extensible. Tests: `supabase/tests/moderation.test.sql`.                                                                                                         |
| Moderation queue with 24-hour response target                                                               | Admin screen: `src/app/admin.tsx` (held content, abuse reports, listing flags). Target documented on-screen and here: every item actioned within 24 hours.                                                                                                                                                                                                     |
| Honest age rating and age gate                                                                              | Birth-year gate (18) at onboarding, enforced server side by trigger: `src/features/auth/validation.ts`, `src/app/(auth)/onboarding.tsx`, `supabase/migrations/20260729000200_age_gate_18.sql`, tested in `supabase/tests/age-gate.test.sql`. Store rating target: Apple 16+ tier; the in-app 18 gate is the stricter control. EULA 1.1 states the 18 requirement. |

## Account deletion

In-app, two taps from settings root: Profile tab -> Settings -> Delete account (`src/app/settings.tsx`). Server side: `delete_account()` (now delegating to `private.delete_account_for` in `supabase/migrations/20260729000100_web_deletion_and_rate_limit.sql`) hard-deletes personal rows and the auth user, and anonymizes the profile row (documented anonymization: signup history keeps referential integrity with no personal data attached). Tested in `supabase/tests/moderation.test.sql`.

Web path (Google Play requirement, works after uninstall): static page `web/delete-account/index.html` served at openmicfinder.app/delete-account, Edge Function `supabase/functions/deletion-request/index.ts`, service-role RPC `delete_account_web`. Identity confirmed by emailed magic link; rate limited; both paths proven identical in `supabase/tests/deletion.test.sql`. Deployment: `docs/DEPLOY_WEB.md`.

## Privacy

- Location: foreground only, requested only on the locate tap in Discover with in-context copy (`src/app/(tabs)/index.tsx`, plugin config in `app.json`). Background location never requested (`isAndroidBackgroundLocationEnabled: false`).
- Data collected: account (email, handle, display name), optional profile fields (bio, home city, birth year), signups and favorites, optional producer contact info (never shown publicly: RLS-verified in `supabase/tests/rls.test.sql`), device push tokens, coarse usage none, tracking none, third-party advertising none.
- Apple privacy manifest source: `docs/privacy/APPLE_PRIVACY.md`. Google Play Data Safety answers: `docs/privacy/PLAY_DATA_SAFETY.md`.

## Guideline 2.1 (completeness)

- Demo credentials and walkthroughs: `REVIEW_NOTES.md`.
- Remaining temporary screens tracked in `REVIEW_NOTES.md`; none may survive to submission.
