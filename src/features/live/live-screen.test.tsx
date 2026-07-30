import { fireEvent, render, screen } from '@testing-library/react-native';

// The screen lives under src/app because that is the route, but the test
// cannot: everything in src/app is a route, so a test file there would ship
// in the app bundle and register a junk path.
import LiveScreen from '@/app/producer/live/[occurrenceId]';

const mockSetStatus = jest.fn();
const mockOnDeck = jest.fn();
// A night starting an hour from now, so the live window is open.
let mockStartsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
let mockRoster: unknown[] = [];

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ occurrenceId: 'occ-1' }),
}));
jest.mock('@/features/producer/queries', () => ({
  useNightContext: () => ({
    data: {
      starts_at: mockStartsAt,
      series: { title: 'Test Mic', timezone: 'America/Los_Angeles', set_length_minutes: 10 },
    },
    isPending: false,
    isError: false,
  }),
}));
jest.mock('@/features/signups/queries', () => ({
  useRoster: () => ({ data: mockRoster, isPending: false, isError: false }),
  useSetSignupStatus: () => ({ mutate: mockSetStatus, isPending: false, isError: false }),
  useMarkOnDeck: () => ({ mutate: mockOnDeck, isPending: false, isError: false }),
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
  mockStartsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  mockRoster = [
    performer({ id: 'sg-1', slot_position: 1, stage_name: 'First' }),
    performer({ id: 'sg-2', slot_position: 2, stage_name: 'Second' }),
  ];
});

describe('running the night', () => {
  it('opens on whoever is up, with the clock at zero', async () => {
    await render(<LiveScreen />);
    expect(screen.getByText('On stage now')).toBeTruthy();
    // Once at the top as the person on stage, once down in the running order.
    expect(screen.getAllByText('First')).toHaveLength(2);
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByText('Up next: Second')).toBeTruthy();
  });

  it('tells the next performer to get ready when the set starts', async () => {
    // The whole point of on deck: they are told before they are needed, not
    // when the host is already looking around for them.
    await render(<LiveScreen />);
    fireEvent.press(screen.getByLabelText('Start the set'));
    expect(mockOnDeck).toHaveBeenCalledWith({ signupId: 'sg-2', onDeck: true });
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
    mockStartsAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    await render(<LiveScreen />);
    expect(screen.getByText('That night is done')).toBeTruthy();
  });

  it('handles an empty list without pretending someone is on stage', async () => {
    mockRoster = [];
    await render(<LiveScreen />);
    expect(screen.getByText('That is the whole list')).toBeTruthy();
  });
});
