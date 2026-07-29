# Deploying the openmicfinder.app web pieces

The `web/` directory holds the small static site that store compliance requires.
Nothing in it has a build step: every file deploys as-is to any static host
(Cloudflare Pages, Netlify, Vercel static, or an S3 bucket behind a CDN).

## What must live where

| URL                                        | File in repo                    | Why                                                                          |
| ------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------- |
| `https://openmicfinder.app/delete-account` | `web/delete-account/index.html` | Google Play web deletion requirement. Linked from the Play Data Safety form. |
| `https://openmicfinder.app/privacy` | TODO(owner): host the privacy policy here | Linked from the paywall (Apple 3.1.2), the delete-account page, and both store listings. |
| `https://openmicfinder.app/terms` | TODO(owner): host the EULA text here (same text as the in-app `eula_versions` current version) | Linked from the paywall (Apple 3.1.2). |

The page must be reachable with no login and no app install.

## Deploying the delete-account page

1. Deploy the `web/` directory so `web/delete-account/index.html` serves at
   `https://openmicfinder.app/delete-account` (and `/delete-account/`).
2. Deploy the Edge Function from the repo root:

   ```sh
   supabase functions deploy deletion-request
   ```

   `supabase/config.toml` already sets `verify_jwt = false` for it: the page's
   visitors have no session, and identity is proven by the emailed link instead.

3. Set the function secrets:

   ```sh
   supabase secrets set ALLOWED_ORIGIN=https://openmicfinder.app
   supabase secrets set DELETE_PAGE_URL=https://openmicfinder.app/delete-account/
   supabase secrets set RATE_LIMIT_SALT=<any long random string>
   ```

4. Edit `web/delete-account/index.html` and replace the `FUNCTION_URL`
   placeholder with the deployed function URL:
   `https://<project-ref>.supabase.co/functions/v1/deletion-request`.
5. In the Supabase dashboard under Authentication, Redirect URLs, add
   `https://openmicfinder.app/delete-account/` so the magic link may land there.
6. Verify end to end with a throwaway account: request the link from the page,
   open it, confirm, then check that signing in fails and the profile row shows
   "Deleted user".
7. Enter `https://openmicfinder.app/delete-account` in the Play Console Data
   Safety form under account deletion.

## How the deletion flow works

1. The page posts `{ action: "request", email }` to the Edge Function.
2. The function rate limits (3 per email per hour, 10 per IP per hour, only
   salted hashes stored), then asks Supabase Auth to email a magic link with
   `shouldCreateUser: false`. The response never reveals whether an account
   exists.
3. The emailed link redirects back to the page with an access token in the URL
   fragment. The page switches to the confirm step.
4. The page posts `{ action: "confirm", access_token }`. The function resolves
   the token to a user with the service role and calls the `delete_account_web`
   RPC, which runs the exact same deletion body as the in-app path
   (`private.delete_account_for`). Accounts that never finished onboarding are
   deleted too. The pgTAP suite (`supabase/tests/deletion.test.sql`) proves both
   paths end in the same state and that invalid or already-deleted accounts
   fail safely.

## Universal Links and App Links files

Covered in a later phase: `web/.well-known/apple-app-site-association` and
`web/.well-known/assetlinks.json` deploy from the same static site. See the
placeholders in those files for the values the owner must fill in after EAS
credentials exist.
