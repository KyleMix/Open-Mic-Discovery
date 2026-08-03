import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getSupabase } from '@/lib/supabase';

import { useToggleFavorite } from './queries';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/lib/notifications', () => ({ registerPushToken: jest.fn() }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

const mockedGetSupabase = getSupabase as jest.Mock;

function supabaseWhereDeleteFails(fail: boolean) {
  const result = fail ? { error: { code: '42501', message: 'rls says no' } } : { error: null };
  const chain = {
    upsert: jest.fn().mockResolvedValue({ error: null }),
    delete: jest.fn(() => ({ eq: jest.fn(() => ({ eq: jest.fn().mockResolvedValue(result) })) })),
  };
  return { from: jest.fn(() => chain) };
}

async function setup(deleteFails: boolean) {
  mockedGetSupabase.mockReturnValue(supabaseWhereDeleteFails(deleteFails));
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const row = {
    series_id: 's1',
    created_at: '2026-08-01T00:00:00Z',
    series: null,
    next_starts_at: null,
  };
  queryClient.setQueryData(['favorites', 'u1'], [row]);
  queryClient.setQueryData(['favorites', 'u1', 's1'], true);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useToggleFavorite(), { wrapper });
  return { queryClient, result };
}

describe('useToggleFavorite optimistic update', () => {
  it('removes the row and flag instantly, before the server answers', async () => {
    const { queryClient, result } = await setup(false);
    result.current.mutate({ userId: 'u1', seriesId: 's1', favorite: false });
    await waitFor(() => {
      expect(queryClient.getQueryData(['favorites', 'u1'])).toEqual([]);
      expect(queryClient.getQueryData(['favorites', 'u1', 's1'])).toBe(false);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls the star and the list back when the server refuses', async () => {
    const { queryClient, result } = await setup(true);
    result.current.mutate({ userId: 'u1', seriesId: 's1', favorite: false });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const list = queryClient.getQueryData<{ series_id: string }[]>(['favorites', 'u1']);
    expect(list?.map((f) => f.series_id)).toEqual(['s1']);
    expect(queryClient.getQueryData(['favorites', 'u1', 's1'])).toBe(true);
    expect(result.current.error?.message).not.toContain('rls');
  });
});
