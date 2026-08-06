import { render, screen } from '@testing-library/react-native';

import { BrandHeader, Logo, LogoMark } from './logo';

describe('brand lockup', () => {
  it('renders the wordmark and labels the lockup for screen readers', async () => {
    await render(<Logo />);
    expect(screen.getByLabelText('Open Mic Explorer')).toBeTruthy();
    expect(screen.getByText('OPEN MIC EXPLORER')).toBeTruthy();
  });

  it('drops the wordmark when only the mark is wanted', async () => {
    await render(<Logo showWordmark={false} />);
    expect(screen.getByLabelText('Open Mic Explorer')).toBeTruthy();
    expect(screen.queryByText('OPEN MIC EXPLORER')).toBeNull();
  });

  it('renders the compact navigation lockup', async () => {
    await render(<BrandHeader />);
    expect(screen.getByText('OPEN MIC EXPLORER')).toBeTruthy();
  });

  it('sizes the mark by height at the artwork aspect ratio', async () => {
    // The mark is taller than it is wide (329x423 in assets/brand/mark.svg),
    // so `size` is its height and the width follows. A square box would
    // letterbox it and throw the lockup spacing off.
    await render(<LogoMark size={423} />);
    expect(screen.getByTestId('logo-mark')).toHaveStyle({ height: 423, width: 329 });
  });
});
