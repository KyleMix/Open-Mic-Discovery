import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useEffect } from 'react';
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

/**
 * Resolves a push payload to an in-app route. Outbox payloads carry either
 * series_id (new mic nearby) or occurrence_id (signup updates, reminders,
 * on deck); occurrences resolve to their mic page with one lookup.
 */
export async function pathFromNotificationData(data: unknown): Promise<string | null> {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as Record<string, unknown>;
  if (typeof payload.series_id === 'string') {
    return `/mic/${payload.series_id}`;
  }
  if (typeof payload.occurrence_id === 'string') {
    const { data: occ } = await getSupabase()
      .from('mic_occurrences')
      .select('series_id')
      .eq('id', payload.occurrence_id)
      .maybeSingle();
    if (occ?.series_id) {
      return `/mic/${occ.series_id}`;
    }
  }
  return null;
}

/**
 * Routes notification taps: both the tap that cold-started the app and taps
 * while it is running land on the mic the notification is about. Before
 * this, tapping a push just opened the app wherever it last was.
 */
export function useNotificationTaps(onRoute: (path: string) => void): void {
  useEffect(() => {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return;
    }
    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const initial = await Notifications.getLastNotificationResponseAsync();
        if (initial && !cancelled) {
          const path = await pathFromNotificationData(initial.notification.request.content.data);
          if (path && !cancelled) {
            onRoute(path);
          }
        }
        subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
          const path = await pathFromNotificationData(response.notification.request.content.data);
          if (path) {
            onRoute(path);
          }
        });
      } catch {
        // No notifications module in this environment; taps cannot happen.
      }
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [onRoute]);
}
