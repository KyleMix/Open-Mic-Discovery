/**
 * Denied writes must reach the user as failures.
 *
 * Postgres row level security filters rows out of an UPDATE rather than
 * raising. A refused update therefore comes back as `{ error: null }`, byte
 * identical to one that changed a row. Every update in this app asks for the
 * affected ids back and treats an empty set as a refusal; these tests hold
 * all eight sites to that.
 *
 * The assertion is on what the mutation does (reject, with a message a person
 * can read) rather than on how the query builder was chained, so it stays
 * true if the chain is rewritten and false if the guard is dropped.
 */
import type { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { useUpdateProfile } from '@/features/profile/queries';
import {
  useConfirmSeries,
  useEnableProducerRole,
  useUpdateOccurrence,
  useUpdateSeries,
} from '@/features/producer/queries';
import { useResolveFlag, useResolveReport } from '@/features/safety/queries';
import { useSetSignupStatus } from '@/features/signups/queries';
import { getSupabase } from '@/lib/supabase';
import { createWrapper, createTestQueryClient, type QueryWrapper } from '@/test/query-harness';
import { affectedRows, createFakeSupabase, type FakeResult } from '@/test/supabase-fake';

// A factory, not an automock: automocking loads the real module to derive its
// shape, and that pulls in AsyncStorage's native binding, which does not exist
// under Jest.
jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));

const mockedGetSupabase = jest.mocked(getSupabase);

/** Points every call this app can make at one reply. */
function serverReplies(result: FakeResult): void {
  mockedGetSupabase.mockReturnValue(createFakeSupabase(() => result).client);
}

/** What row level security does to a write the caller is not allowed to make. */
const FILTERED_OUT: FakeResult = { data: [], error: null };
/** What the same write looks like when it actually changes a row. */
const ONE_ROW_CHANGED: FakeResult = { data: affectedRows(1), error: null };

type WriteCase = {
  name: string;
  /** The message the person using the app should see when the write is refused. */
  refusedMessage: string;
  invoke: (wrapper: QueryWrapper) => Promise<unknown>;
};

const WRITE_SITES: WriteCase[] = [
  {
    name: 'useConfirmSeries',
    refusedMessage: 'Could not confirm this mic. You may no longer manage it.',
    invoke: async (wrapper) => {
      const { result } = await renderHook(() => useConfirmSeries(), { wrapper });
      return result.current.mutateAsync('series-1');
    },
  },
  {
    name: 'useUpdateSeries',
    refusedMessage: 'Could not save these changes. You may no longer manage this mic.',
    invoke: async (wrapper) => {
      const { result } = await renderHook(() => useUpdateSeries(), { wrapper });
      return result.current.mutateAsync({ seriesId: 'series-1', patch: { title: 'New title' } });
    },
  },
  {
    name: 'useUpdateOccurrence',
    refusedMessage: 'Could not save this night. You may no longer manage this mic.',
    invoke: async (wrapper) => {
      const { result } = await renderHook(() => useUpdateOccurrence(), { wrapper });
      return result.current.mutateAsync({
        occurrenceId: 'occurrence-1',
        seriesId: 'series-1',
        patch: { status: 'cancelled', cancellation_note: 'Venue closed tonight.' },
      });
    },
  },
  {
    name: 'useEnableProducerRole',
    refusedMessage: 'Could not enable producer tools on this account.',
    invoke: async (wrapper) => {
      const { result } = await renderHook(() => useEnableProducerRole(), { wrapper });
      return result.current.mutateAsync('user-1');
    },
  },
  {
    name: 'useSetSignupStatus',
    refusedMessage: 'Could not update this signup. You may no longer manage this night.',
    invoke: async (wrapper) => {
      const { result } = await renderHook(() => useSetSignupStatus(), { wrapper });
      return result.current.mutateAsync({ signupId: 'signup-1', status: 'confirmed' });
    },
  },
  {
    name: 'useUpdateProfile',
    refusedMessage: 'Could not save your profile changes.',
    invoke: async (wrapper) => {
      const { result } = await renderHook(() => useUpdateProfile('user-1'), { wrapper });
      return result.current.mutateAsync({ display_name: 'New name' });
    },
  },
  {
    name: 'useResolveReport',
    refusedMessage: 'Could not resolve this report. It may already be resolved.',
    invoke: async (wrapper) => {
      const { result } = await renderHook(() => useResolveReport(), { wrapper });
      return result.current.mutateAsync({
        reportId: 'report-1',
        adminId: 'admin-1',
        actioned: true,
      });
    },
  },
];

describe('a write refused by row level security', () => {
  let wrapper: QueryWrapper;
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    wrapper = createWrapper(queryClient);
  });

  afterEach(() => {
    // Left alone, the client's notify scheduler keeps a timer alive and Jest
    // hangs for a second after the run reporting an open handle.
    queryClient.clear();
    jest.clearAllMocks();
  });

  /**
   * Renders the hook, runs the write, then lets the resulting state changes
   * land. The settle step is what keeps React from warning about an update
   * outside act() after the test has already moved on.
   *
   * The render deliberately happens outside act(): renderHook does its own
   * rendering, and nesting it inside an outer act() stops the effect that
   * populates `result.current` from flushing, leaving it null.
   */
  const runWrite = async (invoke: WriteCase['invoke']): Promise<void> => {
    try {
      await invoke(wrapper);
    } finally {
      await act(async () => {});
    }
  };

  // Asserting the exact message, not merely "it rejected". A bare
  // rejects.toThrow() passes on any rejection at all, including a TypeError
  // from the test's own setup, which makes it a test that cannot fail for the
  // reason it claims to.
  it.each(WRITE_SITES)(
    '$name rejects with a readable message when no row was changed',
    async ({ invoke, refusedMessage }) => {
      serverReplies(FILTERED_OUT);
      await expect(runWrite(invoke)).rejects.toThrow(refusedMessage);
    },
  );

  it.each(WRITE_SITES)('$name succeeds when a row was changed', async ({ invoke }) => {
    serverReplies(ONE_ROW_CHANGED);
    // No rejection is the assertion: a write that landed must not be reported
    // as a failure either.
    await runWrite(invoke);
  });

  // resolve_flag moved into a server-side RPC, so a refusal arrives as an
  // error reply rather than a filtered-out row set.
  const resolveFlag = async (wrapper: QueryWrapper) => {
    const { result } = await renderHook(() => useResolveFlag(), { wrapper });
    return result.current.mutateAsync({ flagId: 'flag-1', adminId: 'admin-1', confirmed: true });
  };

  it('useResolveFlag rejects with a readable message when the server refuses', async () => {
    serverReplies({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(runWrite(resolveFlag)).rejects.toThrow(
      'Your account is not allowed to do that. Sign in with the right account and try again.',
    );
  });

  it('useResolveFlag succeeds when the server resolves the flag', async () => {
    serverReplies(ONE_ROW_CHANGED);
    await runWrite(resolveFlag);
  });
});
