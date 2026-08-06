/**
 * A QueryClient scoped to one test.
 *
 * The app's own client in `src/lib/query-client.ts` is a module-scope
 * singleton with retries and an AsyncStorage persister attached. Sharing it
 * across tests would leak cache between them and make failures depend on
 * file order, so hook tests build their own client and throw it away.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType, ReactNode } from 'react';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Retries turn a deterministic failure into a slow deterministic
      // failure, and nothing here is testing retry behavior.
      //
      // gcTime matters as much as retry: a cache entry left with the default
      // five minute collection window schedules a five minute timer, which
      // keeps the Jest worker alive long after the assertions are done and
      // shows up as a leaked-handle warning.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

export type QueryWrapper = ComponentType<{ children: ReactNode }>;

export function createWrapper(client: QueryClient): QueryWrapper {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
