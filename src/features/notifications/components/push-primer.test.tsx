import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import { createTestQueryClient } from '@/test/query-harness';

import { PushPrimer } from './push-primer';

const mockState = jest.fn();
jest.mock('@/lib/notifications', () => ({
  getPushPermissionState: () => mockState(),
  registerPushToken: jest.fn(),
}));

// createTestQueryClient rather than a bare new QueryClient: the default five
// minute gcTime schedules a timer per cache entry, and these tests settle a
// query, so the bare client left the Jest worker alive after the assertions
// finished. Under --runInBand that is a hang; in parallel mode Jest force exits
// the worker and warns instead. See src/test/query-harness.tsx.
function renderPrimer() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <PushPrimer userId="user-1" message="We can remind you before you go on." />
    </QueryClientProvider>,
  );
}

describe('PushPrimer', () => {
  it('primes with the reason before any system dialog', async () => {
    mockState.mockResolvedValue('undetermined');
    await renderPrimer();
    expect(await screen.findByText('We can remind you before you go on.')).toBeTruthy();
    expect(screen.getByText('Turn on notifications')).toBeTruthy();
  });

  it('says so honestly after a denial and points at settings', async () => {
    mockState.mockResolvedValue('denied');
    await renderPrimer();
    expect(await screen.findByText(/switched off for this app/)).toBeTruthy();
    expect(screen.getByText('Open system settings')).toBeTruthy();
  });

  it('renders nothing once granted', async () => {
    mockState.mockResolvedValue('granted');
    await renderPrimer();
    // Settle the query, then confirm neither branch rendered.
    await expect(
      screen.findByText('Turn on notifications', {}, { timeout: 300 }),
    ).rejects.toThrow();
    expect(screen.queryByText(/switched off/)).toBeNull();
  });
});
