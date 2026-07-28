import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { getSupabase } from './supabase';

/**
 * Registers this device for push after sign-in. Fails quietly: simulators,
 * denied permission, and missing EAS project config are all normal states,
 * and notifications are never required to use the app.
 *
 * Expo Go dropped remote push support in SDK 53, and importing
 * expo-notifications there throws at module load, so the import stays lazy
 * and Expo Go is skipped outright. Development and production builds keep
 * full push.
 */
export async function registerPushToken(userId: string): Promise<void> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return;
  }
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const request = await Notifications.requestPermissionsAsync();
      granted = request.status === 'granted';
    }
    if (!granted) {
      return;
    }
    const token = await Notifications.getExpoPushTokenAsync();
    await getSupabase()
      .from('device_push_tokens')
      .upsert(
        {
          profile_id: userId,
          expo_token: token.data,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        },
        { onConflict: 'expo_token' },
      );
  } catch {
    // No push in this environment; nothing to do.
  }
}
