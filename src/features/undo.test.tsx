import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useCancelNight, usePauseSeries } from '@/features/producer/queries';
import { useWithdraw } from '@/features/signups/queries';
import { getSupabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/lib/notifications', () => ({ registerPushToken: jest.fn() }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));
jest.mock('@/components/toast', () => ({ useToast: () => mockToast }));

const mockToast = { show: jest.fn() };
const mockedGetSupabase = getSupabase as jest.Mock;

type DbResult =
  { data?: unknown; error: null } | { data?: unknown; error: { code?: string; message: string } };
type Call = { table: string; method: string; args: unknown[] };

/**
 * A recording supabase stub: every chain method returns the chain, the
 * chain is awaitable, and each await consumes the next queued result.
 */
function installSupabase(queue: DbResult[]): Call[] {
  const calls: Call[] = [];
  mockedGetSupabase.mockReturnValue({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ['update', 'insert', 'delete', 'eq', 'select']) {
        chain[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return chain;
        };
      }
      chain.then = (resolve: (value: DbResult) => void) =>
        resolve(queue.shift() ?? { error: null });
      return chain;
    },
  });
  return calls;
}

async function setup<T>(hook: () => T, queue: DbResult[]) {
  const calls = installSupabase(queue);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(hook, { wrapper });
  return { calls, result };
}

function lastToastAction(): { label: string; onPress: () => void } {
  const call = mockToast.show.mock.calls.at(-1);
  expect(call?.[1]?.label).toBe('Undo');
  return call?.[1] as { label: string; onPress: () => void };
}

beforeEach(() => {
  mockToast.show.mockClear();
});

describe('withdraw undo', () => {
  it('reverses the withdrawal by re-inserting the signup', async () => {
    const { calls, result } = await setup(useWithdraw, [{ error: null }, { error: null }]);
    result.current.mutate({ occurrenceId: 'o1', userId: 'u1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.some((c) => c.table === 'signups' && c.method === 'delete')).toBe(true);

    lastToastAction().onPress();
    await waitFor(() => {
      const insert = calls.find((c) => c.table === 'signups' && c.method === 'insert');
      expect(insert?.args[0]).toEqual({ occurrence_id: 'o1', performer_id: 'u1' });
    });
    await waitFor(() =>
      expect(mockToast.show).toHaveBeenLastCalledWith('You are back on the list.'),
    );
  });

  it('explains an undo that fails because the window closed, in plain language', async () => {
    const { result } = await setup(useWithdraw, [
      { error: null },
      { error: { code: '42501', message: 'new row violates row-level security policy' } },
    ]);
    result.current.mutate({ occurrenceId: 'o1', userId: 'u1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    lastToastAction().onPress();
    await waitFor(() => {
      const message = mockToast.show.mock.calls.at(-1)?.[0] as string;
      expect(message).toContain('signups closed');
      expect(message).not.toContain('row-level');
    });
  });
});

describe('cancel-a-night undo', () => {
  it('reverses the cancellation by restoring the scheduled status', async () => {
    const { calls, result } = await setup(useCancelNight, [
      { data: [{ id: 'o1' }], error: null },
      { data: [{ id: 'o1' }], error: null },
    ]);
    result.current.mutate({
      occurrenceId: 'o1',
      seriesId: 's1',
      note: 'PA broke',
      dateLabel: 'Tonight',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toMatchObject({
      table: 'mic_occurrences',
      method: 'update',
      args: [{ status: 'cancelled', cancellation_note: 'PA broke' }],
    });
    expect(mockToast.show.mock.calls.at(-1)?.[0]).toContain('Tonight is cancelled');

    lastToastAction().onPress();
    await waitFor(() => {
      const restore = calls.filter((c) => c.method === 'update').at(-1);
      expect(restore?.args[0]).toEqual({ status: 'scheduled', cancellation_note: null });
    });
    await waitFor(() => expect(mockToast.show).toHaveBeenLastCalledWith('The night is back on.'));
  });

  it('surfaces a failed restore with a next step, never the raw error', async () => {
    const { result } = await setup(useCancelNight, [
      { data: [{ id: 'o1' }], error: null },
      { error: { message: 'deadlock detected op 0x33' } },
    ]);
    result.current.mutate({ occurrenceId: 'o1', seriesId: 's1', note: null, dateLabel: 'Tonight' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    lastToastAction().onPress();
    await waitFor(() => {
      const message = mockToast.show.mock.calls.at(-1)?.[0] as string;
      expect(message).toContain('Could not restore the night');
      expect(message).not.toContain('deadlock');
    });
  });
});

describe('pause-listing undo', () => {
  it('reverses the pause by setting the listing active again', async () => {
    const { calls, result } = await setup(usePauseSeries, [
      { data: [{ id: 's1' }], error: null },
      { data: [{ id: 's1' }], error: null },
    ]);
    result.current.mutate('s1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toMatchObject({
      table: 'mic_series',
      method: 'update',
      args: [{ is_active: false }],
    });

    lastToastAction().onPress();
    await waitFor(() => {
      const resume = calls.filter((c) => c.method === 'update').at(-1);
      expect(resume?.args[0]).toEqual({ is_active: true });
    });
    await waitFor(() =>
      expect(mockToast.show).toHaveBeenLastCalledWith('The listing is live again.'),
    );
  });

  it('surfaces a failed resume with a next step', async () => {
    const { result } = await setup(usePauseSeries, [
      { data: [{ id: 's1' }], error: null },
      { error: { message: 'op failure 500' } },
    ]);
    result.current.mutate('s1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    lastToastAction().onPress();
    await waitFor(() => {
      const message = mockToast.show.mock.calls.at(-1)?.[0] as string;
      expect(message).toContain('Could not resume the listing');
      expect(message).not.toContain('500');
    });
  });
});
