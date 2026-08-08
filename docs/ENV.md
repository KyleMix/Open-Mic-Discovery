# Environment variables

Every variable the code reads, where its value comes from, and which build
profile needs it. Verified against the code 2026-08-08 (the grep in
BASELINE.md regenerates the list).

Two rules frame all of it:

1. Anything prefixed EXPO_PUBLIC_ is inlined into the JS bundle at build
   time and is therefore public. Only the anon key ever rides in the app;
   the service role key exists solely in Supabase Edge Function config and
   is never an EXPO_PUBLIC_ value. `scripts/check-backend.mjs` verifies the
   wiring before a build.
2. Local development reads `.env` (gitignored, template in `.env.example`).
   EAS builds read EAS environment variables per environment (preview,
   production), created with `npx eas env:create`. The `.env` file is never
   bundled.

## App (client bundle)

| Variable                             | Required                             | Read in                        | Value source                                                                                                                                                                      | development    | preview              | production                      |
| ------------------------------------ | ------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------- | ------------------------------- |
| EXPO_PUBLIC_SUPABASE_URL             | Yes, throws if unset                 | src/lib/env.ts                 | Local: `npx supabase start` output. Hosted: Supabase dashboard, Project Settings, API                                                                                             | local URL      | hosted project URL   | hosted project URL              |
| EXPO_PUBLIC_SUPABASE_ANON_KEY        | Yes, throws if unset                 | src/lib/env.ts                 | Same place as the URL; the anon (publishable) key, never service role                                                                                                             | local anon key | hosted anon key      | hosted anon key                 |
| EXPO_PUBLIC_SENTRY_DSN               | No; crash reporting inert without it | src/lib/sentry.ts              | sentry.io, Project Settings, Client Keys                                                                                                                                          | optional       | recommended          | required for a monitored launch |
| EXPO_PUBLIC_IMAGE_TRANSFORMS_ENABLED | No; off unless exactly "true"        | src/lib/image-url.ts           | Set "true" only after confirming the Storage render endpoint answers on your Supabase plan (paid feature); if it does not, avatars and posters fail to load rather than fall back | unset          | unset until verified | unset until verified            |
| EXPO_PUBLIC_AGE_SIGNAL_ENABLED       | No; flagged off                      | src/features/auth/ageSignal.ts | Leave unset until the platform age-signal APIs are adopted                                                                                                                        | unset          | unset                | unset                           |

## EAS build time (not runtime)

| Variable                                      | Purpose                                                                                                                                      | Where                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN | Source map upload by @sentry/react-native during EAS builds; the config plugin reads env because app.json deliberately carries no Sentry org | EAS environment variables (secret), from sentry.io Auth Tokens |

## Server side (never in the app)

| Variable                                | Purpose                                                                                | Where                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | Injected automatically by Supabase into Edge Functions (deletion-request, push-sender) | Supabase manages these; never copy them anywhere else              |
| push_sender_url, push_sender_token      | pg_cron invoker for the push-sender function                                           | Supabase Vault secrets, per the header of migration 20260803000700 |

## Local tooling only

CODESPACES, CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
(scripts/dev URL rewriting), TZ and OPENMIC_TEST_TZ (deterministic test
timezones). Not used in builds.

## One key that lives in a file instead

The Google Maps Android API key sits in `app.json`
(`android.config.googleMaps.apiKey`) because react-native-maps consumes it
from the manifest; it ships inside every Android binary by design. It MUST
be restricted in Google Cloud Console to package
`com.openmicexplorer.app` plus the release SHA-1 fingerprints (the key in
git history is otherwise liftable). Steps in LAUNCH-CHECKLIST.md. iOS uses
Apple Maps and needs no key.

## Commands

```
# local
cp .env.example .env    # then fill from `npx supabase start`
npm run dev:env         # sync helper
npm run check:backend   # verifies which backend a build would talk to

# EAS (per environment: preview, production)
npx eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
npx eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>
npx eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value <dsn>
```
