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
