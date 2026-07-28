import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAnonKey, getSupabaseUrl } from './env';

/**
 * Lazily created singleton so importing this module never throws before
 * env is available (for example in unit tests).
 *
 * The client becomes SupabaseClient<Database> in Phase 1, once the schema
 * exists and types are generated into src/types/database.types.ts.
 */
let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  client ??= createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
  return client;
}
