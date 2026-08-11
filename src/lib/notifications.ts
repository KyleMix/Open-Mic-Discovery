import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { getSupabase } from './supabase';

/**
 * Registers this device for push. Fails quietly: simulators, denied
 * permission, and missing EAS project config are all normal states, and
 * notifications are never required to use the app.
 *
 * The OS permission prompt fires only when `promptIfNeeded` is set, from a
 * moment where notifications obviously matter (first signup, first
 * favorite, turning on a notification preference). Sign-in only refreshes
 * the token for people who already granted permission; ambushing a brand
 * new user with the dialog before they have seen a single mic tanked the
 * grant rate and was flagged in the UX review.
 *
 * Expo Go dropped remote push support in SDK 53, and importing
 * expo-notifications there throws at module load, so the import stays lazy
 * and Expo Go is skipped outright. Development and production builds keep
 * full push.
 */
export async function registerPushToken(
  userId: string,
  { promptIfNeeded = false }: { promptIfNeeded?: boolean } = {},
): Promise<void> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return;
  }
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    let granted = status === 'granted';
    if (!granted && promptIfNeeded) {
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

export type PushPermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/**
 * Where this install stands with the OS on notifications, so screens can
 * prime before the system dialog and say so honestly after a denial,
 * instead of showing toggles that silently do nothing.
 */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'unavailable';
  }
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
      return 'granted';
    }
    if (status === 'denied') {
      return 'denied';
    }
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

type PushPayload = {
  occurrence_id?: string;
  series_id?: string;
  network?: boolean;
};

function asPushPayload(data: unknown): PushPayload | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const d = data as Record<string, unknown>;
  const occurrence = typeof d.occurrence_id === 'string' ? d.occurrence_id : undefined;
  const series = typeof d.series_id === 'string' ? d.series_id : undefined;
  const network = d.network === true;
  return occurrence || series || network
    ? { occurrence_id: occurrence, series_id: series, network }
    : null;
}

/** The screen a push payload points at, or null when it points nowhere. */
export async function routeForPushPayload(data: unknown): Promise<string | null> {
  const payload = asPushPayload(data);
  if (!payload) {
    return null;
  }
  // Connection requests and accepts land on the screen where the answer
  // is. Network lives under the Profile tab as a stack screen.
  if (payload.network) {
    return '/network';
  }
  if (payload.series_id) {
    return `/mic/${payload.series_id}`;
  }
  if (payload.occurrence_id) {
    try {
      const { data: occurrence } = await getSupabase()
        .from('mic_occurrences')
        .select('series_id')
        .eq('id', payload.occurrence_id)
        .maybeSingle();
      if (occurrence?.series_id) {
        return `/mic/${occurrence.series_id}`;
      }
    } catch {
      // Offline or gone; landing on the last screen beats crashing the tap.
    }
  }
  return null;
}

type NotificationResponseLike = {
  notification: { request: { content: { data?: unknown } } };
};

/**
 * Makes push notifications tappable: signup updates, on-deck alerts,
 * reminders, and new-mic alerts open the mic they are about, both from a
 * cold start and while the app is running. Returns an unsubscribe.
 */
export function observeNotificationTaps(onRoute: (path: string) => void): () => void {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return () => undefined;
  }
  let removed = false;
  let subscription: { remove: () => void } | null = null;
  (async () => {
    try {
      const Notifications = await import('expo-notifications');
      const respond = async (response: NotificationResponseLike | null) => {
        if (!response) {
          return;
        }
        const path = await routeForPushPayload(response.notification.request.content.data);
        if (path && !removed) {
          onRoute(path);
        }
      };
      await respond(await Notifications.getLastNotificationResponseAsync());
      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        void respond(response);
      });
      if (removed) {
        sub.remove();
      } else {
        subscription = sub;
      }
    } catch {
      // No notifications in this environment; nothing to observe.
    }
  })();
  return () => {
    removed = true;
    subscription?.remove();
  };
}
