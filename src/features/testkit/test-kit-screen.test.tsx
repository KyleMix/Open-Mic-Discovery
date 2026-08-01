import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// The screen lives under src/app because that is the route, but the test
// cannot: everything in src/app is a route, so a test file there would ship
// in the app bundle and register a junk path.
import TestKitScreen from '@/app/test-kit';
import { EXPECTED_KIT_VERSION } from '@/features/testkit/queries';

// The lanes resolve a promise and then set state, so React needs to know it
// is in a test environment or every one of them warns about act().
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Press, and let the lane's promise settle inside act. */
const press = async (label: string) => {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
};

const mockPush = jest.fn();
const mockSeed = jest.fn();
const mockShift = jest.fn();
const mockFill = jest.fn();
const mockRestart = jest.fn();

let mockStatus: Record<string, unknown> = {};
let mockIsAdmin = true;

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/features/auth/session', () => ({
  useSession: () => ({ session: { user: { id: 'owner-1' } } }),
}));
jest.mock('@/features/auth/queries', () => ({
  useOwnProfile: () => ({
    data: { is_admin: mockIsAdmin, is_performer: true, is_producer: true },
    isPending: false,
    isError: false,
  }),
}));
jest.mock('@/features/testkit/queries', () => ({
  EXPECTED_KIT_VERSION: 4,
  useTestKitStatus: () => ({
    data: mockStatus,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useSeedScenario: () => ({ mutateAsync: mockSeed, isPending: false, variables: undefined }),
  useShiftOccurrence: () => ({ mutateAsync: mockShift, isPending: false }),
  useFillRoster: () => ({ mutateAsync: mockFill, isPending: false }),
  useRestartNight: () => ({ mutateAsync: mockRestart, isPending: false }),
  useSetTestRoles: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetTestKitEnabled: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResetTestData: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

beforeEach(() => {
  mockPush.mockClear();
  mockSeed.mockClear();
  mockShift.mockClear();
  mockFill.mockClear();
  mockRestart.mockClear();
  mockShift.mockResolvedValue({});
  mockFill.mockResolvedValue({});
  mockRestart.mockResolvedValue({});
  mockIsAdmin = true;
  mockStatus = {
    kit_version: EXPECTED_KIT_VERSION,
    enabled: true,
    password: 'openmic-test-1234',
    counts: {},
    logins: [],
    next_night: {
      occurrence_id: 'occ-1',
      series_id: 'series-1',
      title: 'Test Kit Live Room',
      starts_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      live_open: true,
    },
  };
});

describe('every test is a lane', () => {
  it('builds the situation and walks straight into it', async () => {
    // The whole point: no setting something up and then going to find it.
    mockSeed.mockResolvedValue({
      scenario: 'live',
      summary: 'A show already running.',
      series_id: 'series-9',
      occurrence_id: 'occ-9',
    });
    await render(<TestKitScreen />);
    await press('Run a live show');
    await waitFor(() => expect(mockSeed).toHaveBeenCalledWith('live'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/producer/live/occ-9'));
  });

  it('sends the roster lanes to the night, not to the live controls', async () => {
    mockSeed.mockResolvedValue({
      scenario: 'lottery',
      summary: 'Nine names for five slots.',
      series_id: 'series-2',
      occurrence_id: 'occ-2',
    });
    await render(<TestKitScreen />);
    await press('Draw a lottery');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/producer/night/occ-2'));
  });

  it('sends the browse lanes to discovery, which needs no ids at all', async () => {
    mockSeed.mockResolvedValue({ scenario: 'week', summary: 'Six listings.' });
    await render(<TestKitScreen />);
    await press('Browse and filter');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(tabs)'));
  });

  it('sends the claim lane to the listing itself', async () => {
    mockSeed.mockResolvedValue({
      scenario: 'unclaimed',
      summary: 'An unclaimed mic.',
      series_id: 'series-3',
    });
    await render(<TestKitScreen />);
    await press('Claim a listing');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/mic/series-3'));
  });

  it('goes nowhere, and says so, when the scenario built nothing to go to', async () => {
    // A stale database answers with a summary and no ids. Pushing a night
    // screen with no night is a blank screen and a confused tester.
    mockSeed.mockResolvedValue({ scenario: 'live', summary: 'Something.' });
    await render(<TestKitScreen />);
    await press('Run a live show');
    await waitFor(() =>
      expect(screen.getByText(/did not build what this test needs/)).toBeTruthy(),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('stays put and reports the failure when the build itself fails', async () => {
    mockSeed.mockRejectedValue(new Error('unknown scenario: live (22023)'));
    await render(<TestKitScreen />);
    await press('Run a live show');
    await waitFor(() => expect(screen.getByText(/unknown scenario/)).toBeTruthy());
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('the tools act and then show their work', () => {
  it('adds performers and opens the list they landed on', async () => {
    await render(<TestKitScreen />);
    await press('Add 3 performers and open the list');
    await waitFor(() => expect(mockFill).toHaveBeenCalledWith({ occurrenceId: 'occ-1', count: 3 }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/producer/night/occ-1'));
  });

  it('rewinds and drops straight back into the show', async () => {
    await render(<TestKitScreen />);
    await press('Rewind it and run it live');
    await waitFor(() => expect(mockRestart).toHaveBeenCalledWith('occ-1'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/producer/live/occ-1'));
  });

  it('moves a night into the window before running it, when it is too far out', async () => {
    // Live only opens an hour before the start, so without this the lane
    // lands on "Not yet" instead of on the show.
    mockStatus = {
      ...mockStatus,
      next_night: { ...(mockStatus.next_night as object), live_open: false },
    };
    await render(<TestKitScreen />);
    await press('Rewind it and run it live');
    await waitFor(() =>
      expect(mockShift).toHaveBeenCalledWith({ occurrenceId: 'occ-1', minutes: 30 }),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/producer/live/occ-1'));
  });

  it('opens the mic page after moving a night, so the change is visible', async () => {
    await render(<TestKitScreen />);
    await press('30 min');
    await waitFor(() =>
      expect(mockShift).toHaveBeenCalledWith({ occurrenceId: 'occ-1', minutes: 30 }),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/mic/series-1'));
  });
});

describe('a database that is behind', () => {
  it('says so, rather than letting every lane fail with a 404', async () => {
    mockStatus = { ...mockStatus, kit_version: 1 };
    await render(<TestKitScreen />);
    expect(screen.getByText(/older test kit/)).toBeTruthy();
  });

  it('says nothing when the database is current', async () => {
    await render(<TestKitScreen />);
    expect(screen.queryByText(/older test kit/)).toBeNull();
  });
});

describe('who can see any of this', () => {
  it('shows a non-admin nothing to press', async () => {
    mockIsAdmin = false;
    await render(<TestKitScreen />);
    expect(screen.getByText('This area is for the app owner.')).toBeTruthy();
    expect(screen.queryByLabelText('Run a live show')).toBeNull();
  });
});
