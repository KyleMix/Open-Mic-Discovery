import { fireEvent, render, screen } from '@testing-library/react-native';

// The screen lives under src/app because that is the route, but the test
// cannot: everything in src/app is a route, so a test file there would ship
// in the app bundle and register a junk path.
import LiveScreen from '@/app/producer/live/[occurrenceId]';

const mockSetStatus = jest.fn();
const mockOnDeck = jest.fn();
const mockEndShow = jest.fn();
const mockReopen = jest.fn();
let mockEndedAt: string | null = null;
// A night starting an hour from now, so the live window is open.
let mockStartsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
let mockRoster: unknown[] = [];
let mockSpots: { capacity: number | null; taken: number; spots_left: number | null } | null = {
  capacity: 12,
  taken: 8,
  spots_left: 4,
};

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
// The ownership gate needs a signed-in host who manages the mocked mic.
jest.mock('@/features/auth/session', () => ({
  useSession: () => ({ session: { user: { id: 'host-1' } }, ready: true }),
}));
jest.mock('@/features/auth/queries', () => ({
  useOwnProfile: () => ({ data: { is_admin: false }, isPending: false, isError: false }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ occurrenceId: 'occ-1' }),
}));
jest.mock('@/features/producer/queries', () => ({
  useNightContext: () => ({
    data: {
      starts_at: mockStartsAt,
      live_ended_at: mockEndedAt,
      series: {
        id: 'series-1',
        title: 'Test Mic',
        timezone: 'America/Los_Angeles',
        set_length_minutes: 10,
        owner_id: 'host-1',
        created_by: 'host-1',
      },
    },
    isPending: false,
    isError: false,
  }),
  useEndShow: () => ({ mutate: mockEndShow, isPending: false, isError: false }),
  useReopenShow: () => ({ mutate: mockReopen, isPending: false, isError: false }),
}));
jest.mock('@/features/signups/queries', () => ({
  useRoster: () => ({ data: mockRoster, isPending: false, isError: false }),
  useSetSignupStatus: () => ({ mutate: mockSetStatus, isPending: false, isError: false }),
  useMarkOnDeck: () => ({ mutate: mockOnDeck, isPending: false, isError: false }),
  useNightSpots: () => ({ data: mockSpots, isPending: false, isError: false }),
}));

const performer = (over: Record<string, unknown>) => ({
  id: 'sg-1',
  status: 'confirmed',
  slot_position: 1,
  created_at: '2026-08-10T18:00:00.000Z',
  stage_name: 'First',
  handle: 'first',
  performer_id: 'p-1',
  on_deck_at: null,
  ...over,
});

beforeEach(() => {
  mockSetStatus.mockClear();
  mockOnDeck.mockClear();
  mockEndShow.mockClear();
  mockReopen.mockClear();
  mockEndedAt = null;
  mockStartsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  mockSpots = { capacity: 12, taken: 8, spots_left: 4 };
  mockRoster = [
    performer({ id: 'sg-1', slot_position: 1, stage_name: 'First' }),
    performer({ id: 'sg-2', slot_position: 2, stage_name: 'Second' }),
  ];
});

describe('running the night', () => {
  it('opens on whoever is up, with the full set on the clock', async () => {
    await render(<LiveScreen />);
    expect(screen.getByText('On stage now')).toBeTruthy();
    // Once at the top as the person on stage, once down in the running order.
    expect(screen.getAllByText('First')).toHaveLength(2);
    // The mic hands out 10 minute sets, so that is what the clock starts at.
    expect(screen.getByText('10:00')).toBeTruthy();
    expect(screen.getByText('left of a 10 minute set')).toBeTruthy();
    expect(screen.getByText('Up next: Second')).toBeTruthy();
  });

  it('tells the next performer to get ready when the set starts', async () => {
    // The whole point of on deck: they are told before they are needed, not
    // when the host is already looking around for them.
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('Start the set'));
    expect(mockOnDeck).toHaveBeenCalledWith({ signupId: 'sg-2', onDeck: true });
    // Stop the clock again before the test ends. Starting a set starts a
    // 250ms interval, and leaving it running races the worker shutting down.
    fireEvent.press(await screen.findByLabelText('Pause'));
  });

  it('does not tell them twice if they already know', async () => {
    mockRoster = [
      performer({ id: 'sg-1', slot_position: 1, stage_name: 'First' }),
      performer({
        id: 'sg-2',
        slot_position: 2,
        stage_name: 'Second',
        on_deck_at: '2026-08-11T02:10:00.000Z',
      }),
    ];
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('Start the set'));
    expect(mockOnDeck).not.toHaveBeenCalled();
  });

  it('marks the set done and moves the night on', async () => {
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('Next up: Second'));
    expect(mockSetStatus).toHaveBeenCalledWith({ signupId: 'sg-1', status: 'performed' });
  });

  it('moves on deck a set ahead, not onto the person walking up', async () => {
    // Telling someone to get ready as they reach the microphone is a beat
    // too late to be worth anything. The flag comes off them and goes to the
    // one behind.
    mockRoster = [
      performer({ id: 'sg-1', slot_position: 1, stage_name: 'First' }),
      performer({
        id: 'sg-2',
        slot_position: 2,
        stage_name: 'Second',
        on_deck_at: '2026-08-11T02:10:00.000Z',
      }),
      performer({ id: 'sg-3', slot_position: 3, stage_name: 'Third' }),
    ];
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('Next up: Second'));
    expect(mockOnDeck).toHaveBeenCalledWith({ signupId: 'sg-2', onDeck: false });
    expect(mockOnDeck).toHaveBeenCalledWith({ signupId: 'sg-3', onDeck: true });
  });

  it('has a way to record a no-show, which is a different thing', async () => {
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('First did not show'));
    expect(mockSetStatus).toHaveBeenCalledWith({ signupId: 'sg-1', status: 'no_show' });
  });

  it('says so on the last set rather than promising another', async () => {
    mockRoster = [performer({ id: 'sg-1', slot_position: 1, stage_name: 'Only One' })];
    await render(<LiveScreen />);
    expect(screen.getByText('Last one of the night.')).toBeTruthy();
    expect(screen.getByLabelText('Finish the night')).toBeTruthy();
  });

  it('stays shut until an hour before the door', async () => {
    // Marking performer one done for a night three days out would be very
    // hard to explain to performer one.
    mockStartsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await render(<LiveScreen />);
    expect(screen.getByText('Not yet')).toBeTruthy();
    expect(screen.queryByText('0:00')).toBeNull();
  });

  it('shuts again once the night is long over', async () => {
    mockStartsAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await render(<LiveScreen />);
    expect(screen.getByText('That night is done')).toBeTruthy();
  });

  it('handles an empty list without pretending someone is on stage', async () => {
    mockRoster = [];
    await render(<LiveScreen />);
    expect(screen.getByText('That is the whole list')).toBeTruthy();
  });

  it('asks before ending the show, because it cannot be tapped by accident', async () => {
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('End show'));
    expect(mockEndShow).not.toHaveBeenCalled();
    // And says what it costs: people still waiting to go up.
    expect(await screen.findByText('End the show?')).toBeTruthy();
    expect(screen.getByText(/2 still to go up/)).toBeTruthy();
  });

  it('ends it on the second tap', async () => {
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('End show'));
    fireEvent.press(await screen.findByLabelText('Yes, end the show'));
    expect(mockEndShow).toHaveBeenCalledWith('occ-1');
  });

  it('lets the host back out of the question', async () => {
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('End show'));
    fireEvent.press(await screen.findByLabelText('Keep going'));
    // The plain button being back is the question having gone away.
    expect(await screen.findByLabelText('End show')).toBeTruthy();
    expect(screen.queryByText('End the show?')).toBeNull();
    expect(mockEndShow).not.toHaveBeenCalled();
  });

  it('stays open past the old six hour cutoff, until the host ends it', async () => {
    // A night that runs long used to lose its controls mid-show.
    mockStartsAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    await render(<LiveScreen />);
    expect(screen.getByText('On stage now')).toBeTruthy();
  });

  it('closes once the host has ended it, whatever the clock says', async () => {
    mockEndedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await render(<LiveScreen />);
    expect(screen.getByText('Show ended')).toBeTruthy();
    expect(screen.queryByText('On stage now')).toBeNull();
  });

  it('offers a way back for a host who ended it by mistake', async () => {
    // With people still waiting to go up, this is a bad five minutes.
    mockEndedAt = new Date(Date.now() - 60 * 1000).toISOString();
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('Reopen the show'));
    expect(mockReopen).toHaveBeenCalledWith('occ-1');
  });
});

describe('the numbers a host is asked for all night', () => {
  it('shows spots open, progress, and the waitlist while a set is running', async () => {
    await render(<LiveScreen />);
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('of 12 open')).toBeTruthy();
    expect(screen.getByText('2 still to go')).toBeTruthy();
  });

  it('keeps them on screen once the whole list is done', async () => {
    // The screenshot that started this: every name marked done, and the
    // screen went blank apart from the list. "Can I put one more person up"
    // is exactly the question at that moment.
    mockRoster = [
      performer({ id: 'sg-1', slot_position: 1, stage_name: 'First', status: 'performed' }),
      performer({ id: 'sg-2', slot_position: 2, stage_name: 'Second', status: 'performed' }),
    ];
    mockSpots = { capacity: 12, taken: 2, spots_left: 10 };
    await render(<LiveScreen />);
    expect(screen.getByText('That is the whole list')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('of 12 open')).toBeTruthy();
    expect(screen.getByText('all done')).toBeTruthy();
  });

  it('says Full rather than a number when every spot is taken', async () => {
    mockSpots = { capacity: 8, taken: 8, spots_left: 0 };
    await render(<LiveScreen />);
    expect(screen.getByText('Full')).toBeTruthy();
    expect(screen.getByText('all 8 taken')).toBeTruthy();
  });

  it('says nothing it cannot know when the host set no cap', async () => {
    mockSpots = { capacity: null, taken: 4, spots_left: null };
    await render(<LiveScreen />);
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('no cap set')).toBeTruthy();
  });
});

describe('the waitlist, from the room', () => {
  it('puts a waiting performer on the list without leaving the screen', async () => {
    mockRoster = [
      performer({ id: 'sg-1', slot_position: 1, stage_name: 'First' }),
      performer({ id: 'sg-9', slot_position: null, stage_name: 'Hopeful', status: 'waitlisted' }),
    ];
    await render(<LiveScreen />);
    expect(screen.getByText('Waiting for a spot (1)')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Put them on'));
    expect(mockSetStatus).toHaveBeenCalledWith({ signupId: 'sg-9', status: 'confirmed' });
  });

  it('tells a host with a finished list that somebody is still waiting', async () => {
    mockRoster = [
      performer({ id: 'sg-1', slot_position: 1, stage_name: 'First', status: 'performed' }),
      performer({ id: 'sg-9', slot_position: null, stage_name: 'Hopeful', status: 'waitlisted' }),
    ];
    await render(<LiveScreen />);
    expect(screen.getByText(/still waiting/)).toBeTruthy();
    expect(screen.getByLabelText('Put them on')).toBeTruthy();
  });

  it('does not mention a waitlist that is empty', async () => {
    await render(<LiveScreen />);
    expect(screen.queryByText(/Waiting for a spot/)).toBeNull();
  });
});
