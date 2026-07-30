import { render, screen } from '@testing-library/react-native';

import { SignupCard } from './signup-card';

// The "not yet open" message only renders for a signed-in performer; every
// earlier branch (sign in, turn on performing) short-circuits before it.
jest.mock('@/features/auth/session', () => ({
  useSession: () => ({ session: { user: { id: 'user-1' } } }),
}));
jest.mock('@/features/auth/queries', () => ({
  useOwnProfile: () => ({ data: { is_performer: true } }),
}));
jest.mock('@/features/profile/queries', () => ({
  useEnablePerformerRole: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}));
jest.mock('@/features/signups/queries', () => ({
  useMySignup: () => ({ data: null, isPending: false }),
  useJoinList: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
  useWithdraw: () => ({ mutate: jest.fn(), isPending: false }),
}));

const OCCURRENCE = {
  id: 'occ-1',
  // 7:00 PM Pacific.
  starts_at: '2026-08-11T02:00:00.000Z',
  status: 'scheduled',
} as never;

function renderCard(signupOpens: string) {
  return render(
    <SignupCard
      occurrence={OCCURRENCE}
      timezone="America/Los_Angeles"
      signupMethod="first_come"
      signupOpens={signupOpens}
      signupCloses="00:00:00"
    />,
  );
}

describe('when signups have not opened yet', () => {
  it('gives the time for a walk-in list opening the same day', async () => {
    // The bug: an hour before a 7 PM show rendered as "open Monday, Aug 10",
    // the same day as the mic, which told a performer nothing.
    await renderCard('01:00:00');

    expect(screen.getByText(/open at 6:00\s?PM/i)).toBeTruthy();
    // No date, because it is the night of the mic.
    expect(screen.queryByText(/open Monday, Aug 10\./)).toBeNull();
  });

  it('keeps the date when signups open on an earlier day', async () => {
    await renderCard('7 days');

    const text = screen.getByText(/Signups for .* open/i);
    // Both parts matter a week out: which day, and what time that day.
    expect(text.props.children.flat().join('')).toMatch(/Monday, Aug 3 at 7:00\s?PM/i);
  });
});
