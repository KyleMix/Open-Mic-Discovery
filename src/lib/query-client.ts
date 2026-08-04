import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

/**
 * Single QueryClient for the app. gcTime is generous because performers
 * check listings on weak connections (bar parking lots): cached listing
 * data should stay readable.
 */
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
