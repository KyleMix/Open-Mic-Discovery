import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import { PushPrimer } from './push-primer';

const mockState = jest.fn();
jest.mock('@/lib/notifications', () => ({
  getPushPermissionState: () => mockState(),
  registerPushToken: jest.fn(),
}));

function renderPrimer() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
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
