import { render } from '@testing-library/react-native';

import { PhaseShell } from './phase-shell';

describe('PhaseShell', () => {
  it('renders title and body', async () => {
    const { getByText } = await render(<PhaseShell title="Discover" body="Coming in Phase 2." />);
    expect(getByText('Discover')).toBeTruthy();
    expect(getByText('Coming in Phase 2.')).toBeTruthy();
  });

  it('exposes an accessibility label', async () => {
    const { getByLabelText } = await render(
      <PhaseShell title="Discover" body="Coming in Phase 2." />,
    );
    expect(getByLabelText('Discover screen')).toBeTruthy();
  });
});
