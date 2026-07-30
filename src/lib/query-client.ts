import { QueryClient } from '@tanstack/react-query';

/**
 * Single QueryClient for the app. gcTime is generous because performers
 * check listings on weak connections (bar parking lots): cached listing
 * data should stay readable. Offline persistence proper arrives with the
 * discovery feature in Phase 2.
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
