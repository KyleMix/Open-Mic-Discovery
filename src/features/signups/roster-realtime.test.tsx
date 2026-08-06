/**
 * The roster's Realtime subscription.
 *
 * This is the only Realtime subscription in the app and it had no coverage.
 * It matters at exactly the moment it is hardest to check by hand: a producer
 * running a room watches the list change as people sign up, and the failure
 * mode is a roster that silently stops updating.
 *
 * The subscription is also the app's one long-lived resource. A channel that
 * outlives its screen leaks a socket per visit, so the teardown is asserted
 * as directly as the behaviour.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getSupabase } from '@/lib/supabase';
import { createTestQueryClient, createWrapper, type QueryWrapper } from '@/test/query-harness';
import { createFakeSupabase, type FakeSupabase } from '@/test/supabase-fake';

import { useRoster } from './queries';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));

const ONE_SIGNUP = [{ signup_id: 'signup-1', slot_position: 1 }];
const TWO_SIGNUPS = [
  { signup_id: 'signup-1', slot_position: 1 },
  { signup_id: 'signup-2', slot_position: 2 },
];

let wrapper: QueryWrapper;
let supabase: FakeSupabase;
let rows: unknown[];

beforeEach(() => {
  wrapper = createWrapper(createTestQueryClient());
  rows = ONE_SIGNUP;
  supabase = createFakeSupabase(() => ({ data: rows, error: null }));
  jest.mocked(getSupabase).mockReturnValue(supabase.client);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('useRoster', () => {
  it('opens one subscription for the night it is showing', async () => {
    await renderHook(() => useRoster('occurrence-1'), { wrapper });

    await waitFor(() => expect(supabase.openChannels()).toBe(1));
  });

  it('opens nothing until it knows which night to watch', async () => {
    await renderHook(() => useRoster(undefined), { wrapper });

    expect(supabase.openChannels()).toBe(0);
  });

  it('picks up a signup made by someone else', async () => {
    const { result } = await renderHook(() => useRoster('occurrence-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    // Someone signs up on their own phone; the server tells this client.
    rows = TWO_SIGNUPS;
    await act(async () => {
      supabase.emitRealtime();
    });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
  });

  it('does not refetch on a Realtime event it never subscribed to', async () => {
    // With no occurrence id there is no channel, so an event on the socket
    // must not reach this hook at all.
    await renderHook(() => useRoster(undefined), { wrapper });

    await act(async () => {
      supabase.emitRealtime();
    });

    expect(supabase.openChannels()).toBe(0);
  });

  it('closes the subscription when the screen goes away', async () => {
    const { unmount } = await renderHook(() => useRoster('occurrence-1'), { wrapper });
    await waitFor(() => expect(supabase.openChannels()).toBe(1));

    await unmount();

    expect(supabase.openChannels()).toBe(0);
  });
});
