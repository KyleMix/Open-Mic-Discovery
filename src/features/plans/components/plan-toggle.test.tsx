import { render, screen } from '@testing-library/react-native';

import { PlanToggle } from './plan-toggle';

const mockToggle = jest.fn();
let mockGoing = false;
let mockSignedIn = true;

jest.mock('@/features/auth/session', () => ({
  useSession: () => ({ session: mockSignedIn ? { user: { id: 'user-1' } } : null }),
}));
jest.mock('@/features/plans/queries', () => ({
  useMyPlan: () => ({ data: mockGoing, isPending: false }),
  useTogglePlan: () => ({ mutate: mockToggle, isPending: false, isError: false }),
}));

const OCCURRENCE = {
  id: 'occ-1',
  // 7:00 PM Pacific.
  starts_at: '2026-08-11T02:00:00.000Z',
  status: 'scheduled',
} as never;

function renderToggle(method: 'first_come' | 'lottery' = 'first_come') {
  return render(
    <PlanToggle occurrence={OCCURRENCE} timezone="America/Los_Angeles" signupMethod={method} />,
  );
}

beforeEach(() => {
  mockGoing = false;
  mockSignedIn = true;
  mockToggle.mockClear();
});

describe('saying you are going', () => {
  it('says who sees it, at the moment of the tap', async () => {
    // A plan puts a named person at a place on a date. Burying that in a
    // policy page and surfacing it on the producer screen would be a trick.
    await renderToggle();
    expect(screen.getByText(/They see your stage name/)).toBeTruthy();
  });

  it('explains why it matters most on a walk-in night', async () => {
    await renderToggle();
    expect(screen.queryByText(/signed at the venue/)).toBeNull();
    // Signed out is where the reason has to be argued.
    mockSignedIn = false;
    await renderToggle();
    expect(screen.getByText(/signed at the venue/)).toBeTruthy();
  });

  it('offers the way out once you are down as going', async () => {
    mockGoing = true;
    await renderToggle();
    expect(screen.getByText('You are going on Monday, Aug 10')).toBeTruthy();
    expect(screen.getByText('I can no longer make it')).toBeTruthy();
  });

  it('renders the night in the venue timezone, not the reader one', async () => {
    // 2:00 UTC is still the 10th in Los Angeles.
    mockGoing = true;
    await renderToggle();
    expect(screen.getByText(/Aug 10/)).toBeTruthy();
  });

  it('stays out of the way on a night that is off', async () => {
    const cancelled = { ...(OCCURRENCE as object), status: 'cancelled' } as never;
    await render(
      <PlanToggle occurrence={cancelled} timezone="America/Los_Angeles" signupMethod="lottery" />,
    );
    expect(screen.queryByText('I am going')).toBeNull();
  });

  it('asks anonymous readers to sign up rather than silently doing nothing', async () => {
    mockSignedIn = false;
    await renderToggle();
    expect(screen.getByText('I am going')).toBeTruthy();
    expect(mockToggle).not.toHaveBeenCalled();
  });
});
