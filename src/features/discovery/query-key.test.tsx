/**
 * The discovery query key must describe the query, not the whole UI store.
 *
 * The filters store carries members that do not change which mics the
 * server would return: `view` (map or list) and `disciplinesSeeded` (a
 * one-time bookkeeping flag). If either reached the TanStack Query key,
 * every toggle would produce a second key, the same rows would be fetched
 * and stored again, and the AsyncStorage persister would write both
 * copies.
 *
 * The fix under test: the Discover screen passes
 * `selectDiscoveryFilters(store)` to `useDiscoverFeed`, so only the
 * server-relevant members ever reach the key. These tests exercise that
 * projection directly rather than the live store, so the store's async
 * persist rehydration cannot race the assertions.
 */
import { renderHook, waitFor } from '@testing-library/react-native';

import { getSupabase } from '@/lib/supabase';
import {
  DEFAULT_FILTERS,
  selectDiscoveryFilters,
  useFiltersStore,
  type DiscoveryFilters,
} from '@/stores/filters';
import { createTestQueryClient, createWrapper } from '@/test/query-harness';
import { createFakeSupabase } from '@/test/supabase-fake';

import { useDiscoverFeed } from './queries';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));

const CENTER = { lat: 47.6062, lng: -122.3321 };

beforeEach(() => {
  jest
    .mocked(getSupabase)
    .mockReturnValue(createFakeSupabase(() => ({ data: [], error: null })).client);
});

/** The key the discovery query actually registers, as TanStack Query hashes it. */
async function discoveryKey(filters: DiscoveryFilters, query = ''): Promise<string> {
  const client = createTestQueryClient();
  const wrapper = createWrapper(client);
  await renderHook(() => useDiscoverFeed(filters, CENTER, query), { wrapper });
  const [q] = client.getQueryCache().getAll();
  // Let the fetch settle before reading. Otherwise it resolves after the test
  // has moved on, and React warns about a state update outside act().
  await waitFor(() => expect(q.state.fetchStatus).toBe('idle'));
  const hash = q.queryHash;
  client.clear();
  return hash;
}

describe('the discovery query key', () => {
  it('drops every UI-only store member in the projection', () => {
    // The store still carries view and friends; the projection is what keeps
    // them out of the key. If the store gains a new server-relevant member,
    // add it to selectDiscoveryFilters and to this list.
    const projected = selectDiscoveryFilters({
      ...useFiltersStore.getState(),
      ...DEFAULT_FILTERS,
    });
    expect(Object.keys(projected).sort()).toEqual([
      'ages',
      'days',
      'disciplines',
      'freeOnly',
      'methods',
      'radiusKm',
      'timeOfDay',
      'when',
    ]);
  });

  it('is unchanged when the view toggles between map and list', async () => {
    const state = useFiltersStore.getState();
    const listKey = await discoveryKey(selectDiscoveryFilters({ ...state, ...DEFAULT_FILTERS }));
    const mapKey = await discoveryKey(
      selectDiscoveryFilters({ ...state, ...DEFAULT_FILTERS, view: 'map' } as DiscoveryFilters),
    );
    expect(mapKey).toBe(listKey);
  });

  it('does not fork the cache when the view toggles', async () => {
    const client = createTestQueryClient();
    const wrapper = createWrapper(client);
    const state = useFiltersStore.getState();

    await renderHook(
      () => useDiscoverFeed(selectDiscoveryFilters({ ...state, ...DEFAULT_FILTERS }), CENTER, ''),
      { wrapper },
    );
    await renderHook(
      () =>
        useDiscoverFeed(
          selectDiscoveryFilters({
            ...state,
            ...DEFAULT_FILTERS,
            view: 'map',
          } as DiscoveryFilters),
          CENTER,
          '',
        ),
      { wrapper },
    );

    expect(client.getQueryCache().getAll()).toHaveLength(1);
    client.clear();
  });

  it('still changes when a real filter changes', async () => {
    const before = await discoveryKey(DEFAULT_FILTERS);
    const after = await discoveryKey({ ...DEFAULT_FILTERS, freeOnly: true });
    expect(after).not.toBe(before);
  });

  it('changes when the query text changes, but not for padding', async () => {
    const bare = await discoveryKey(DEFAULT_FILTERS, '');
    const padded = await discoveryKey(DEFAULT_FILTERS, '   ');
    const typed = await discoveryKey(DEFAULT_FILTERS, 'olympia');
    expect(padded).toBe(bare);
    expect(typed).not.toBe(bare);
  });
});
