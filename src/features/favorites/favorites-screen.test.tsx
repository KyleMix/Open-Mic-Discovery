/**
 * Favorites screen: loading, empty, error, success, and signed out.
 *
 * CLAUDE.md requires every screen to handle loading, empty, error and success
 * explicitly. Nothing held any screen to that before, so a state could be
 * dropped in a refactor and only turn up in review, or in the store.
 *
 * The assertions are on what a person would see and reach for (the wording of
 * the message, the presence of a retry control) rather than on the component
 * tree, so they survive layout changes and fail on behaviour changes.
 */
import { render, screen } from '@testing-library/react-native';

import { useSession } from '@/features/auth/session';
import { getSupabase } from '@/lib/supabase';
import { createTestQueryClient, createWrapper, type QueryWrapper } from '@/test/query-harness';
import { createFakeSupabase, neverResolves, type FakeHandler } from '@/test/supabase-fake';

// Imported from outside src/app on purpose. Expo Router globs src/app and
// turns every file it finds there into a route, including a test file, which
// then ships to the bundle and blows up at runtime on `expect is not defined`.
// See app-routes.test.ts, which fails if a test file reappears under src/app.
import FavoritesScreen from '@/app/(tabs)/favorites';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/auth/session', () => ({ useSession: jest.fn() }));

const mockedSession = jest.mocked(useSession);

type Session = ReturnType<typeof useSession>['session'];

/** Only the part of the session this screen reads. */
function signedInAs(userId: string): void {
  mockedSession.mockReturnValue({
    session: { user: { id: userId } } as NonNullable<Session>,
    ready: true,
  } as ReturnType<typeof useSession>);
}

function signedOut(): void {
  mockedSession.mockReturnValue({ session: null, ready: true } as ReturnType<typeof useSession>);
}

function serverReplies(handler: FakeHandler): void {
  jest.mocked(getSupabase).mockReturnValue(createFakeSupabase(handler).client);
}

const ONE_FAVORITE = [
  {
    series_id: 'series-1',
    created_at: '2026-07-20T00:00:00Z',
    series: {
      id: 'series-1',
      title: 'Tuesday Comedy Night',
      disciplines: ['comedy'],
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      start_time: '20:00:00',
      last_confirmed_at: '2026-07-27T00:00:00Z',
      venue: { name: 'The Blue Room', city: 'Seattle' },
    },
  },
];

let wrapper: QueryWrapper;

beforeEach(() => {
  wrapper = createWrapper(createTestQueryClient());
  signedInAs('user-1');
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('the favorites screen', () => {
  it('asks a signed out visitor to sign in rather than showing an empty list', async () => {
    signedOut();
    serverReplies(() => ({ data: [], error: null }));

    await render(<FavoritesScreen />, { wrapper });

    expect(await screen.findByText(/Sign in to save the mics you love/)).toBeTruthy();
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
  });

  it('shows a loading state while the request is still open', async () => {
    serverReplies(neverResolves);

    await render(<FavoritesScreen />, { wrapper });

    expect(await screen.findByText('Loading favorites')).toBeTruthy();
  });

  it('explains a failed load and offers a retry', async () => {
    serverReplies(() => ({ data: null, error: { message: 'network down' } }));

    await render(<FavoritesScreen />, { wrapper });

    expect(await screen.findByText(/Could not load favorites/)).toBeTruthy();
    // A dead end is the failure mode that matters here: an error with no way
    // forward is worse than the error.
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });

  it('offers a way forward when there are no favorites yet', async () => {
    serverReplies(() => ({ data: [], error: null }));

    await render(<FavoritesScreen />, { wrapper });

    expect(await screen.findByText('No favorites yet')).toBeTruthy();
    expect(screen.getByLabelText('Find a mic')).toBeTruthy();
  });

  it('lists the saved mics once they load', async () => {
    serverReplies(() => ({ data: ONE_FAVORITE, error: null }));

    await render(<FavoritesScreen />, { wrapper });

    expect(await screen.findByText('Tuesday Comedy Night')).toBeTruthy();
    expect(screen.getByLabelText('Remove Tuesday Comedy Night from favorites')).toBeTruthy();
    // The four states are mutually exclusive: success must not also render
    // the empty copy.
    expect(screen.queryByText('No favorites yet')).toBeNull();
  });
});
