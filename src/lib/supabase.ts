import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { getSupabaseAnonKey, getSupabaseUrl } from './env';

/**
 * Lazily created singleton so importing this module never throws before
 * env is available (for example in unit tests).
 */
let client: SupabaseClient<Database> | undefined;

export function getSupabase(): SupabaseClient<Database> {
  client ??= createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  return client;
}
