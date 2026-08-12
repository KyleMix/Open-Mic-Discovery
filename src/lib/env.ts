/**
 * Environment access. All client-visible variables use the EXPO_PUBLIC_
 * prefix and are inlined at build time. Secrets never live here: server
 * secrets belong to Supabase Edge Function config and EAS secrets.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  return required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Checks the client config the app cannot boot without, without throwing.
 * Returns a human-readable reason when something is missing or malformed, or
 * null when the config is usable.
 *
 * These values are inlined at build time, so a bad one is baked into the
 * binary: no retry or reconnect will fix it. The root layout renders a
 * dedicated screen on a non-null result rather than letting createClient
 * throw deep in the provider tree, where the only signal was a blank screen
 * behind the generic error boundary. The URL rule matches supabase-js
 * (validateSupabaseUrl): non-empty and starting with http:// or https://.
 */
export function getConfigError(): string | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) {
    return 'EXPO_PUBLIC_SUPABASE_URL is missing.';
  }
  if (!/^https?:\/\//i.test(url)) {
    return 'EXPO_PUBLIC_SUPABASE_URL is not a valid HTTP or HTTPS URL.';
  }
  if (!anonKey) {
    return 'EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.';
  }
  return null;
}
