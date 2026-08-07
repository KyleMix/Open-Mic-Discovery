/**
 * The Discover screen's request lifecycle and search behavior, from the
 * corpus in the search rebuild brief: rapid typing produces exactly one
 * settled request, temporal words become visible chips, zero results is
 * never a dead end, and results draw the same MicCard as browsing.
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { getSupabase } from '@/lib/supabase';
import { DEFAULT_FILTERS, useFiltersStore } from '@/stores/filters';
import { useRecentSearches } from '@/stores/recent-searches';
import { createFakeSupabase, type FakeOp } from '@/test/supabase-fake';
import { createTestQueryClient, createWrapper } from '@/test/query-harness';

// Imported from outside src/app on purpose: Expo Router turns any file
// under src/app into a route, test files included. See app-routes.test.ts.
import DiscoverScreen from '@/app/(tabs)/index';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/',
}));
jest.mock('@/features/auth/session', () => ({
  useSession: () => ({ session: null, ready: true }),
}));
jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));
// supercluster ships untransformed ESM; the map is not what these tests
// exercise (the screen defaults to list view).
jest.mock('@/features/discovery/components/mic-map', () => ({
  MicMap: () => null,
}));
// Location and geocoding reach native modules; the screen only needs
// their results.
jest.mock('@/features/discovery/location', () => ({
  DEFAULT_CENTER: { lat: 47.6062, lng: -122.3321 },
  requestForegroundLocation: jest.fn(async () => ({ status: 'denied' })),
}));
jest.mock('@/features/profile/geocode', () => ({
  geocodeHomeArea: jest.fn(async () => null),
}));

type RpcPayload = {
  p_query?: string;
  p_radius_m?: number;
  p_local_from?: string;
  p_local_to?: string;
};

function discoverCalls(calls: FakeOp[]): { payload: RpcPayload }[] {
  return calls.filter((c) => c.rpc === 'search_discover') as unknown as {
    payload: RpcPayload;
  }[];
}

const ROW = {
  series_id: 'series-1',
  title: 'Rusty Fret Open Mic',
  disciplines: ['comedy'],
  description: null,
  signup_method: 'first_come',
  cost_cents: 0,
  set_length_minutes: 5,
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
  start_time: '20:00:00',
  timezone: 'America/Los_Angeles',
  is_active: true,
  last_confirmed_at: new Date().toISOString(),
  venue_id: 'venue-1',
  venue_name: 'The Rusty Fret',
  neighborhood: 'Capitol Hill',
  city: 'Seattle',
  region: 'WA',
  lat: 47.6174,
  lng: -122.3266,
  distance_m: 2253,
  next_occurrence_id: 'occ-1',
  next_starts_at: '2026-08-11T03:00:00.000Z',
  next_local_date: '2026-08-10',
  next_status: 'scheduled',
  poster_url: null,
  featured_name: null,
  capacity: null,
  spots_left: null,
  owner_id: null,
  match_kind: 'text',
  rank_score: 5.0,
};

async function setup(reply: (op: FakeOp) => unknown[] = () => [ROW]) {
  const calls: FakeOp[] = [];
  jest.mocked(getSupabase).mockReturnValue(
    createFakeSupabase((op) => {
      calls.push(op);
      return { data: reply(op), error: null };
    }).client,
  );
  const client = createTestQueryClient();
  const wrapper = createWrapper(client);
  const view = await render(<DiscoverScreen />, { wrapper });
  return { calls, client, view };
}

beforeEach(() => {
  jest.useFakeTimers();
  useFiltersStore.setState({ ...DEFAULT_FILTERS, view: 'list', disciplinesSeeded: true });
  useRecentSearches.setState({ recent: [], saved: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

async function settle(ms = 300) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('Discover request lifecycle', () => {
  it('sends exactly one request for a rapidly typed query', async () => {
    const { view, calls } = await setup();
    await settle();
    const input = view.getByLabelText('Search mics, venues, cities, or hosts');

    // Ten keystrokes faster than the debounce.
    const target = 'rusty fret';
    for (let i = 1; i <= target.length; i += 1) {
      await fireEvent.changeText(input, target.slice(0, i));
      await settle(20);
    }
    await settle(300);

    await waitFor(() => {
      const searches = discoverCalls(calls).filter((c) => c.payload.p_query !== undefined);
      expect(searches).toHaveLength(1);
      expect(searches[0].payload.p_query).toBe('rusty fret');
    });
  });

  it('turns "open mic tonight" into the query "open mic" plus the Tonight chip', async () => {
    const { view, calls } = await setup();
    await settle();
    const input = view.getByLabelText('Search mics, venues, cities, or hosts');

    await fireEvent.changeText(input, 'open mic tonight');
    await settle(300);

    // The token left the box and became filter state.
    expect(input.props.value).toBe('open mic');
    expect(useFiltersStore.getState().when).toBe('tonight');

    await settle(300);
    await waitFor(() => {
      const searches = discoverCalls(calls).filter((c) => c.payload.p_query === 'open mic');
      expect(searches.length).toBeGreaterThan(0);
      expect(searches[searches.length - 1].payload.p_local_from).toBeDefined();
    });
  });

  it('renders results as full cards with the distance visible', async () => {
    const { view } = await setup();
    await settle();
    await waitFor(() => {
      expect(view.getByText('Rusty Fret Open Mic')).toBeTruthy();
      expect(view.getByText(/1\.4 mi/)).toBeTruthy();
    });
  });

  it('offers a wider radius instead of a dead end on zero results', async () => {
    // The feed finds nothing at the default radius; the recovery probe at
    // the next radius up finds two mics.
    const { view, calls } = await setup((op) => {
      const payload = op.payload as RpcPayload;
      if (payload.p_radius_m && payload.p_radius_m > 40000) {
        return [ROW, { ...ROW, series_id: 'series-2', title: 'Second Mic' }];
      }
      return [];
    });
    await settle();
    const input = view.getByLabelText('Search mics, venues, cities, or hosts');
    await fireEvent.changeText(input, 'zzzzzz');
    await settle(300);

    await waitFor(() => {
      expect(view.getByText('No matches for "zzzzzz"')).toBeTruthy();
      expect(view.getByText('2 mics within 50 miles')).toBeTruthy();
      expect(view.getByText('Show nearby mics instead')).toBeTruthy();
    });
    expect(discoverCalls(calls).some((c) => c.payload.p_radius_m === 80000)).toBe(true);
  });
});
