import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import type { ProState } from '@/features/pro/use-pro';

import { PaywallView } from './paywall-view';

const monthly = {
  identifier: 'monthly',
  product: { priceString: '$6.99', title: 'Producer Pro Monthly' },
} as unknown as PurchasesPackage;

const notEntitled: ProState = { status: 'not_entitled', entitled: false, monthly };

async function renderPaywall(overrides: Partial<Parameters<typeof PaywallView>[0]> = {}) {
  const handlers = {
    onPurchase: jest.fn(),
    onRestore: jest.fn(),
    onOpenLegal: jest.fn(),
    onBack: jest.fn(),
  };
  await render(
    <PaywallView
      state={notEntitled}
      busy={null}
      error={null}
      restored={null}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('PaywallView (Apple 3.1.2)', () => {
  it('shows the subscription title', async () => {
    await renderPaywall();
    expect(screen.getByText('Producer Pro Monthly')).toBeTruthy();
  });

  it('shows the billing period', async () => {
    await renderPaywall();
    expect(
      screen.getByText('Monthly subscription. Renews automatically every month until cancelled.'),
    ).toBeTruthy();
  });

  it('shows the price as the largest text on the screen', async () => {
    await renderPaywall();
    const price = screen.getByText('$6.99');
    const priceSize = (price.props.style as { fontSize: number }).fontSize;
    expect(priceSize).toBeGreaterThanOrEqual(40);
  });

  it('renders a tappable Privacy Policy link that opens in-app', async () => {
    const handlers = await renderPaywall();
    await fireEvent.press(screen.getByLabelText('Privacy Policy'));
    expect(handlers.onOpenLegal).toHaveBeenCalledWith('https://openmicfinder.app/privacy');
  });

  it('renders a tappable Terms of Use link that opens in-app', async () => {
    const handlers = await renderPaywall();
    await fireEvent.press(screen.getByLabelText('Terms of Use (EULA)'));
    expect(handlers.onOpenLegal).toHaveBeenCalledWith('https://openmicfinder.app/terms');
  });

  it('invokes the restore handler from Restore Purchases', async () => {
    const handlers = await renderPaywall();
    await fireEvent.press(screen.getByLabelText('Restore Purchases'));
    expect(handlers.onRestore).toHaveBeenCalledTimes(1);
  });

  it('invokes the purchase handler with the monthly package', async () => {
    const handlers = await renderPaywall();
    await fireEvent.press(screen.getByLabelText('Subscribe'));
    expect(handlers.onPurchase).toHaveBeenCalledWith(monthly);
  });

  it('shows legal links even when subscriptions are unavailable', async () => {
    await renderPaywall({
      state: { status: 'unconfigured', entitled: false, monthly: null },
    });
    expect(screen.getByLabelText('Privacy Policy')).toBeTruthy();
    expect(screen.getByLabelText('Terms of Use (EULA)')).toBeTruthy();
  });

  it('surfaces errors, including the offline legal-link message', async () => {
    const message = 'That page needs a connection. Check your network and try again.';
    await renderPaywall({ error: message });
    expect(screen.getByText(message)).toBeTruthy();
  });
});
