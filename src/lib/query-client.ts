import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

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
