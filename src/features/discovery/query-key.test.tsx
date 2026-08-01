/**
 * The discovery query key must describe the query, not the whole UI store.
 *
 * `src/app/(tabs)/index.tsx` calls `useFiltersStore()` with no selector and
 * hands the entire store to `useNearbyMics`, which puts it straight into the
 * TanStack Query key. The store carries two members that do not change which
 * mics the server would return: `view` (map or list) and `disciplinesSeeded`
 * (a one-time bookkeeping flag). Functions drop out of the hash because it is
 * built with JSON.stringify, but those two do not.
 *
 * The cost is not theoretical. Every map/list toggle produces a different
 * key, so the same rows are fetched again and stored again under a second
 * key, and the AsyncStorage persister writes both. There is no size cap on
 * that cache.
 *
 * These are `test.failing`: they say what correct looks like and go red once
 * the source is fixed.
 *
 * Smallest change that would fix it: select in the screen rather than pass
 * the store, for example
 * `const filters = useFiltersStore(useShallow(selectDiscoveryFilters))` where
 * the selector returns only the six `DiscoveryFilters` members, so `view` and
 * `disciplinesSeeded` never reach the key.
 */
import { renderHook, waitFor } from '@testing-library/react-native';

import { getSupabase } from '@/lib/supabase';
import { useFiltersStore, type DiscoveryFilters } from '@/stores/filters';
import { createTestQueryClient, createWrapper } from '@/test/query-harness';
import { createFakeSupabase } from '@/test/supabase-fake';

import { useNearbyMics } from './queries';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));

const CENTER = { lat: 47.6062, lng: -122.3321 };

type StoreState = ReturnType<typeof useFiltersStore.getState>;

/** Only the members that actually select rows on the server. */
function filtersOnly(state: StoreState): DiscoveryFilters {
  const { disciplines, days, radiusKm, freeOnly, methods, timeOfDay } = state;
  return { disciplines, days, radiusKm, freeOnly, methods, timeOfDay };
}

beforeEach(() => {
  jest.mocked(getSupabase).mockReturnValue(
    createFakeSupabase(() => ({ data: [], error: null })).client,
  );
  useFiltersStore.getState().reset();
  useFiltersStore.getState().setView('list');
});

/** The key the discovery query actually registers, as TanStack Query hashes it. */
async function discoveryKey(filters: DiscoveryFilters): Promise<string> {
  const client = createTestQueryClient();
  const wrapper = createWrapper(client);
  await renderHook(() => useNearbyMics(filters, CENTER), { wrapper });
  const [query] = client.getQueryCache().getAll();
  // Let the fetch settle before reading. Otherwise it resolves after the test
  // has moved on, and React warns about a state update outside act().
  await waitFor(() => expect(query.state.fetchStatus).toBe('idle'));
  const hash = query.queryHash;
  client.clear();
  return hash;
}

describe('the discovery query key', () => {
  it('carries UI-only store members, which is the defect described here', () => {
    // Proves the fixture is live: if the store ever stops leaking these, the
    // failing tests below become the real assertions and this one goes red.
    const state = useFiltersStore.getState();
    expect(Object.keys(state)).toEqual(expect.arrayContaining(['view', 'disciplinesSeeded']));
  });

  test.failing('is unchanged when the view toggles between map and list', async () => {
    const listKey = await discoveryKey(useFiltersStore.getState());
    useFiltersStore.getState().setView('map');
    const mapKey = await discoveryKey(useFiltersStore.getState());
    expect(mapKey).toBe(listKey);
  });

  test.failing('is unchanged when the one-time discipline seeding flag flips', async () => {
    const before = await discoveryKey(useFiltersStore.getState());
    useFiltersStore.getState().seedDisciplines([]);
    const after = await discoveryKey(useFiltersStore.getState());
    expect(after).toBe(before);
  });

  test.failing('does not fork the cache when the view toggles', async () => {
    // One set of filters, one cached result. Toggling the map on and off is a
    // rendering choice, not a different question for the server.
    const client = createTestQueryClient();
    const wrapper = createWrapper(client);

    await renderHook(() => useNearbyMics(useFiltersStore.getState(), CENTER), { wrapper });
    useFiltersStore.getState().setView('map');
    await renderHook(() => useNearbyMics(useFiltersStore.getState(), CENTER), { wrapper });

    expect(client.getQueryCache().getAll()).toHaveLength(1);
    client.clear();
  });

  it('is stable across a view toggle once only the filter members are passed', async () => {
    // The shape of the fix, asserted so it cannot regress once applied.
    const listKey = await discoveryKey(filtersOnly(useFiltersStore.getState()));
    useFiltersStore.getState().setView('map');
    const mapKey = await discoveryKey(filtersOnly(useFiltersStore.getState()));
    expect(mapKey).toBe(listKey);
  });

  it('still changes when a real filter changes', async () => {
    // The other half of the contract: narrowing the key must not go so far
    // that genuinely different questions collide.
    const before = await discoveryKey(filtersOnly(useFiltersStore.getState()));
    useFiltersStore.getState().setRadiusKm(5);
    const after = await discoveryKey(filtersOnly(useFiltersStore.getState()));
    expect(after).not.toBe(before);
  });
});
