// Web-based account deletion (Google Play requirement).
//
// Serves the form on https://openmicfinder.app/delete-account, which works
// for people who have uninstalled the app:
//
//   1. { action: "request", email } sends a Supabase Auth magic link to the
//      address. The response is identical whether or not an account exists,
//      so the endpoint cannot be used to probe for accounts.
//   2. The link lands back on the delete-account page with an access token.
//      The page posts { action: "confirm", access_token }. The token proves
//      control of the email; the function then runs the same deletion as the
//      in-app path through the service-role RPC delete_account_web.
//
// Rate limited through the deletion_request_allowed RPC (3 per email per
// hour, 10 per IP per hour) backed by private.rate_limit. Only salted
// hashes of the email and IP are ever stored.
//
// Deploy with: supabase functions deploy deletion-request
// Requires verify_jwt = false (see supabase/config.toml): the page has no
// session. Set ALLOWED_ORIGIN to the page origin in function secrets.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://openmicfinder.app';
const PAGE_URL = Deno.env.get('DELETE_PAGE_URL') ?? 'https://openmicfinder.app/delete-account/';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function hashKey(value: string): Promise<string> {
  // Salted so the stored rate limit keys cannot be reversed to addresses.
  const salt = Deno.env.get('RATE_LIMIT_SALT') ?? 'openmic-deletion';
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'POST only' });
  }

  let body: { action?: string; email?: string; access_token?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  if (body.action === 'request') {
    const email = (body.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json(400, { error: 'Enter a valid email address.' });
    }

    const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
    const { data: allowed, error: limitError } = await service.rpc('deletion_request_allowed', {
      p_email_key: await hashKey(email),
      p_ip_key: await hashKey(ip),
    });
    if (limitError) {
      return json(500, { error: 'Something went wrong. Try again later.' });
    }
    if (!allowed) {
      return json(429, { error: 'Too many requests. Try again in an hour.' });
    }

    // shouldCreateUser: false means no account is ever created by this flow.
    // Errors (including "no such user") are deliberately not surfaced: the
    // response must not reveal whether an account exists.
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    await anon.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: PAGE_URL },
    });
    return json(200, {
      message:
        'If an account exists for that address, a confirmation link is on its way. Open it on this device to finish.',
    });
  }

  if (body.action === 'confirm') {
    const token = body.access_token ?? '';
    if (!token) {
      return json(400, { error: 'Missing confirmation token.' });
    }
    const { data: userData, error: userError } = await service.auth.getUser(token);
    if (userError || !userData.user) {
      return json(401, {
        error: 'That confirmation link is invalid or has expired. Request a new one.',
      });
    }
    // The avatar image can only be removed through the Storage API; the
    // database forbids direct storage deletes. Best effort with the service
    // role, before the account row disappears: a storage hiccup must not
    // block the deletion itself.
    try {
      const { data: files } = await service.storage.from('avatars').list(userData.user.id);
      if (files && files.length > 0) {
        await service.storage
          .from('avatars')
          .remove(files.map((file) => `${userData.user.id}/${file.name}`));
      }
    } catch {
      // Storage unavailable; proceed with the deletion.
    }
    const { error: deleteError } = await service.rpc('delete_account_web', {
      p_user_id: userData.user.id,
    });
    if (deleteError) {
      // P0002: no live profile for this user (already deleted, or the
      // account never finished onboarding and holds no profile data).
      if (deleteError.code === 'P0002') {
        return json(410, { error: 'This account has already been deleted.' });
      }
      return json(500, {
        error: 'Deletion failed. Try again, or contact support@openmicfinder.app.',
      });
    }
    return json(200, {
      message: 'Your account is deleted. Your sign-in and personal data are gone.',
    });
  }

  return json(400, { error: 'Unknown action.' });
});
