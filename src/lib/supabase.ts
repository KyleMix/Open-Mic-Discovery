import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from '@/types/database.types';

import { getSupabaseAnonKey, getSupabaseUrl } from './env';

/**
 * Lazily created singleton so importing this module never throws before
 * env is available (for example in unit tests).
 */
let client: SupabaseClient<Database> | undefined;

export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
    // The refresh timer only runs while the app is foregrounded (the wiring
    // supabase-js expects on React Native). Without this, a long background
    // let the token lapse and the first taps after foregrounding failed.
    const started = client;
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        started.auth.startAutoRefresh();
      } else {
        started.auth.stopAutoRefresh();
      }
    });
    started.auth.startAutoRefresh();
  }
  return client;
}
