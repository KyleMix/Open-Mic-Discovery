# Compliance Checklist

Maps each store requirement to the implementing code. Living document; updated whenever a listed surface changes.

## Apple Guideline 1.2 (user generated content)

| Requirement                                                                                                 | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom EULA prohibiting objectionable content and abuse, affirmative accept, version and timestamp recorded | EULA text: `supabase/migrations/20260728000600_views_and_eula.sql` (eula_versions). Gate: `src/app/(auth)/eula.tsx`. Server-stamped acceptance: `private.guard_profile_writes` in `supabase/migrations/20260728001000_moderation.sql`. Re-accept on new version: `AuthGate` in `src/app/_layout.tsx`.                                                                                                                                                                   |
| Report action on every listing and profile                                                                  | Reusable modal: `src/features/safety/components/report-modal.tsx`. Listings: `src/app/mic/[id].tsx` (Report abusive content). Profiles: producer via listing report (block offer), performers via roster rows in `src/app/producer/night/[occurrenceId].tsx`. No comments or reviews exist in v1 (approved at Step 0, Q1).                                                                                                                                              |
| Block action, enforced server side                                                                          | Block writes: `src/features/safety/queries.ts`. Enforcement: `private.is_blocked_pair` filters `public_profiles`/`performer_public`/`producer_public` views both directions, and `private.is_blocked_by_producer` blocks signups (`supabase/migrations/20260728000350_safety.sql`, `20260728000400_occurrences_signups.sql`). Unblock: `src/app/settings.tsx`.                                                                                                          |
| Automated first-pass content filter on free text                                                            | `private.text_is_clean` + guard triggers in `supabase/migrations/20260728001000_moderation.sql`; clean text goes live, matches are held as pending. Term list is data (`banned_terms`), admin-extensible. Tests: `supabase/tests/moderation.test.sql`.                                                                                                                                                                                                                  |
| Moderation queue with 24-hour response target                                                               | Admin screen: `src/app/admin.tsx` (held content, abuse reports, listing flags). Target documented on-screen and here: every item actioned within 24 hours.                                                                                                                                                                                                                                                                                                              |
| Honest age rating and age gate                                                                              | Birth-year gate (18) at onboarding, enforced server side by trigger: `src/features/auth/validation.ts`, `src/app/(auth)/onboarding.tsx`, `supabase/migrations/20260729000200_age_gate_18.sql`, tested in `supabase/tests/age-gate.test.sql`. The store rating is answered from the evidence list in `docs/store/SUBMISSION_CHECKLIST.md` rather than aimed at a tier; the in-app 18 gate is the stricter control regardless. EULA 1.1 onward states the 18 requirement. |

## Account deletion

In-app, two taps from settings root: Profile tab -> Settings -> Delete account (`src/app/settings.tsx`). Server side: `delete_account()` delegates to `private.delete_account_for` (effective definition in `supabase/migrations/20260804000200_delete_account_avatar_cleanup.sql`), which hard-deletes personal rows, the avatar object in the public bucket, and the auth user, and anonymizes the profile row (documented anonymization: signup history keeps referential integrity with no personal data attached). Abuse reports a person filed keep their anonymized profile id for moderation-audit integrity; no personal data rides along. Tested in `supabase/tests/moderation.test.sql`.

Web path (Google Play requirement, works after uninstall): static page `web/delete-account/index.html` served at www.stonedgooseproductions.com/open-mics/delete-account, Edge Function `supabase/functions/deletion-request/index.ts`, service-role RPC `delete_account_web`. Identity confirmed by emailed magic link; rate limited; both paths run the same `private.delete_account_for` and are proven identical in `supabase/tests/deletion.test.sql`. Deployment: `docs/DEPLOY_WEB.md`.

## Privacy

- Privacy policy: in-app at `src/app/privacy.tsx` (content in `src/features/legal/privacy-policy.ts`), reachable by guests, at the EULA gate, from sign-up, and from Settings; the auth gate allows the route in every state (`src/app/_layout.tsx`). Hostable web copy: `docs/privacy/PRIVACY_POLICY.md` (the URL both store forms require). Out-of-app deletion page copy: `docs/store/ACCOUNT_DELETION_PAGE.md`.
- Location: foreground only, requested only on the locate tap in Discover with in-context copy (`src/app/(tabs)/index.tsx`, plugin config in `app.json`). Background location never requested (`isAndroidBackgroundLocationEnabled: false`). The required home area is user-entered text geocoded on device; its coordinates are stored privately on the profile and declared as coarse location in both store forms.
- Data collected: account (email, handle, display name), optional profile fields (bio, home city, birth year), signups and favorites, optional producer contact info (never shown publicly: RLS-verified in `supabase/tests/rls.test.sql`), device push tokens, coarse usage none, tracking none, third-party advertising none.
- Apple privacy manifest source: `docs/privacy/APPLE_PRIVACY.md`, app-level declaration in `app.json` (`ios.privacyManifests`), per-SDK audit in `docs/privacy/SDK_MANIFEST_AUDIT.md`. Google Play Data Safety answers: `docs/privacy/PLAY_DATA_SAFETY.md` (summary) and `docs/store/DATA_SAFETY_ANSWERS.md` (question by question).

## Guideline 2.1 (completeness)

- Demo credentials and walkthroughs: `REVIEW_NOTES.md`.
- Remaining temporary screens tracked in `REVIEW_NOTES.md`; none may survive to submission.
- Reviewer cold start never blank: `src/features/discovery/center.ts` (Seattle fallback with visible note), `e2e/reviewer-coldstart.yaml`.

## Guideline 3.1.2 (subscriptions): not applicable

The app sells nothing. There is no in-app purchase, no subscription, and no
payment SDK, so 3.1.2 does not apply and Restore Purchases is not required.

## Guideline 3.1.5(a) (real-world services)

- Some mics charge performers for a reserved stage slot. That is payment for a real-world service at a physical venue, settled at the venue or with the host, never in the app. The app only shows that a cost exists and says so in plain copy: `src/features/signups/components/signup-card.tsx`.
- Payment model statement for reviewers: `REVIEW_NOTES.md`, Payment model section.

## Platform requirements map (July 2026 audit additions)

| Requirement                                                                                                                          | Implementing files                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android target API 36, iOS floor 16.4                                                                                                | `app.json` (expo-build-properties plugin block)                                                                                                                                                                 |
| Play web account deletion                                                                                                            | `web/delete-account/index.html`, `supabase/functions/deletion-request/index.ts`, `supabase/migrations/20260729000100_web_deletion_and_rate_limit.sql`, `supabase/tests/deletion.test.sql`, `docs/DEPLOY_WEB.md` |
| Age gate 18, server enforced; store rating answered from evidence, not from a target tier (see `docs/store/SUBMISSION_CHECKLIST.md`) | `supabase/migrations/20260729000200_age_gate_18.sql`, `supabase/tests/age-gate.test.sql`, `src/features/auth/validation.ts`                                                                                     |
| Platform age signal (flagged off)                                                                                                    | `src/features/auth/ageSignal.ts`, `src/features/auth/ageSignal.test.ts`                                                                                                                                         |
| Abuse rate limiting                                                                                                                  | `supabase/migrations/20260729000300_rate_limits_applied.sql`, `supabase/tests/rate-limits.test.sql`                                                                                                             |
| Universal Links / App Links for /mic/*                                                                                               | `app.json`, `web/.well-known/apple-app-site-association`, `web/.well-known/assetlinks.json`, `src/lib/linking.test.ts`, `docs/DEPLOY_WEB.md`                                                                    |
| SDK privacy manifests                                                                                                                | `docs/privacy/SDK_MANIFEST_AUDIT.md`                                                                                                                                                                            |
| Play Data Safety answers                                                                                                             | `docs/store/DATA_SAFETY_ANSWERS.md`                                                                                                                                                                             |
| E2E review flows in CI                                                                                                               | `.github/workflows/e2e.yml`, `e2e/reviewer-coldstart.yaml`                                                                                                                                                      |

## Store readiness pass verification (2026-08-08)

Every Guideline 1.2 row above was re-verified on this date against a fresh
database built from the full migration set (scripts/db/verify-local.sh: 71
migrations, seed, 707 pgTAP assertions passing). The moderation loop was
traced live end to end, not inferred from code: a report filed as the demo
performer appeared in the admin queue as open, moderate_content('series',
..., false) flipped the listing to rejected and removed it from
search_discover and direct reads for every non-admin session, the report
resolution stamped resolved_by from the session, and both actions appended
rows to admin.audit_log naming the moderator.

Changed by the pass:

- Moderator actions are now audited (migration
  `20260808000100_moderation_actions_are_audited.sql`, tests in
  `supabase/tests/moderation-audit.test.sql`). Previously moderate_content,
  resolve_flag, review_claim, and report resolutions left no audit rows;
  the audit log migration had documented that gap as waiting for the
  console. The takedown path a reviewer will exercise is the in-app one, so
  it audits now. Signatures are unchanged and the app needed no changes.
- The 1024x1024 store icon is re-encoded without its (unused) alpha
  channel, since App Store Connect rejects marketing icons with
  transparency.

Verified unchanged: report reachability is at most two taps from every
user-generated surface (listing page: report listing, report host or
featured credit with block offer; night roster: report or block a
performer; Settings: unblock list). The web console described in
`docs/admin/RUNBOOK.md` remains unbuilt; the in-app `/admin` screen plus
that runbook are the operative 24-hour takedown path, and
`admin.security_settings.require_aal2` stays off until the owner enrolls
MFA (see `docs/LAUNCH-CHECKLIST.md`).
