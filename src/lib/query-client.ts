import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

/**
 * Single QueryClient for the app. gcTime is generous because performers
 * check listings on weak connections (bar parking lots): cached listing
 * data should stay readable.
 */
/**
 * Version stamp for the persisted cache.
 *
 * Persisted rows are plain JSON written by an older build, and nothing in
 * them describes their shape. When a column is added or renamed, the stale
 * row is restored and rendered before the refetch lands, so a screen reads a
 * field that did not exist when the row was cached. Adding stage_name did
 * exactly that: the profile tab crashed on a name that was undefined.
 *
 * Bump this whenever a migration changes the shape of anything cached. The
 * cost of bumping needlessly is one extra fetch. The cost of forgetting is a
 * crash that only reproduces for people who used the previous build.
 */
export const CACHE_BUSTER = '2026-07-30-stage-name';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
    },
  },
});

/**
 * React Native does not tell TanStack Query about connectivity or focus by
 * itself. Without these two listeners, queries fired offline burned their
 * retries instead of pausing, nothing refetched when the connection came
 * back, and nothing refreshed when the app returned to the foreground: a
 * performer who backgrounded the app at a mic came back to whatever was on
 * screen when they left.
 *
 * Guarded off the web server render: setEventListener runs its setup
 * immediately, and expo-network's web module reaches for `window`, which
 * Expo Router's Node-side static render does not have. The server renders
 * once and never changes connectivity, so it needs no listeners; the
 * browser and native both pass the guard.
 */
if (Platform.OS !== 'web' || typeof window !== 'undefined') {
  onlineManager.setEventListener((setOnline) => {
    const sub = Network.addNetworkStateListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    // Optional call: the Jest environment's expo-network mock hands back no
    // subscription object.
    return () => sub?.remove?.();
  });

  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (status) => {
      handleFocus(status === 'active');
    });
    return () => sub?.remove?.();
  });
}

/**
 * Cached server data survives restarts so listings stay readable offline
 * (performers check this app in parking lots with one bar of signal).
 * Lives next to the client so sign-out can clear both together.
 */
export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage });

/**
 * Sign-out must leave nothing of the previous account on the device: the
 * persisted cache holds private rows (home coordinates, birth year, and
 * for admins the moderation queue) that would otherwise survive for the
 * next person to sign in on a shared device.
 */
export async function clearCachedData(): Promise<void> {
  queryClient.clear();
  await queryPersister.removeClient();
}
