import { QueryClient } from '@tanstack/react-query';

/**
 * Single QueryClient for the app. gcTime is generous because performers
 * check listings on weak connections (bar parking lots): cached listing
 * data should stay readable. Offline persistence proper arrives with the
 * discovery feature in Phase 2.
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
