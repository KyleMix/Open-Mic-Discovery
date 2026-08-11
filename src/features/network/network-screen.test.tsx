/**
 * Network screen: signed out, loading, error, empty, and success, plus the
 * split between requests waiting on you and the people you already have.
 * Assertions are on what a person would see and reach for, not the tree.
 */
import { render, screen } from '@testing-library/react-native';

import { useSession } from '@/features/auth/session';
import { getSupabase } from '@/lib/supabase';
import { createTestQueryClient, createWrapper, type QueryWrapper } from '@/test/query-harness';
import { createFakeSupabase, neverResolves, type FakeHandler } from '@/test/supabase-fake';

import NetworkScreen from '@/app/network';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/network',
  // The route renders its header via Stack.Screen in every state.
  Stack: { Screen: () => null },
}));
jest.mock('@/features/auth/session', () => ({ useSession: jest.fn() }));

const mockedSession = jest.mocked(useSession);

type Session = ReturnType<typeof useSession>['session'];

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

function connection(overrides: Record<string, unknown>) {
  return {
    requester_id: 'user-1',
    addressee_id: 'p1',
    status: 'accepted',
    created_at: '2026-08-01T00:00:00Z',
    responded_at: '2026-08-02T00:00:00Z',
    i_requested: true,
    other_id: 'p1',
    handle: 'djmate',
    stage_name: 'DJ Mate',
    avatar_url: null,
    bio: null,
    is_performer: true,
    is_producer: false,
    link_instagram: 'djmate',
    link_tiktok: null,
    link_youtube: null,
    link_website: null,
    link_spotify: null,
    link_apple_music: null,
    ...overrides,
  };
}

let wrapper: QueryWrapper;

beforeEach(() => {
  wrapper = createWrapper(createTestQueryClient());
  signedInAs('user-1');
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('the network screen', () => {
  it('tells a signed out visitor what connecting is, and is not', async () => {
    signedOut();
    serverReplies(() => ({ data: [], error: null }));

    await render(<NetworkScreen />, { wrapper });

    expect(await screen.findByText('Know who else is out there')).toBeTruthy();
    expect(screen.getByText(/No messaging, no feed, and you can disconnect anytime/)).toBeTruthy();
  });

  it('shows a loading state while the request is still open', async () => {
    serverReplies(neverResolves);

    await render(<NetworkScreen />, { wrapper });

    expect(await screen.findByText('Loading your network')).toBeTruthy();
  });

  it('explains a failed load and offers a retry', async () => {
    serverReplies((op) =>
      op.table === 'my_connections'
        ? { data: null, error: { message: 'down' } }
        : { data: [], error: null },
    );

    await render(<NetworkScreen />, { wrapper });

    expect(await screen.findByText(/Could not load your network/)).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });

  it('invites the first connection when the network is empty', async () => {
    serverReplies(() => ({ data: [], error: null }));

    await render(<NetworkScreen />, { wrapper });

    expect(await screen.findByText(/Nobody yet/)).toBeTruthy();
    expect(screen.getByLabelText('Add someone you met')).toBeTruthy();
  });

  it('splits requests waiting on you from the people you have', async () => {
    serverReplies((op) => {
      if (op.table === 'my_connections') {
        return {
          data: [
            connection({}),
            connection({
              other_id: 'p2',
              handle: 'newpal',
              stage_name: 'New Pal',
              status: 'pending',
              i_requested: false,
              requester_id: 'p2',
              addressee_id: 'user-1',
            }),
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    });

    await render(<NetworkScreen />, { wrapper });

    // The ask leads with its own section and both answers.
    expect(await screen.findByText('Wants to connect')).toBeTruthy();
    expect(screen.getByText('New Pal')).toBeTruthy();
    expect(screen.getByLabelText('Accept')).toBeTruthy();
    expect(screen.getByLabelText('Decline')).toBeTruthy();
    // The accepted connection shows with its exits: remove and report.
    expect(screen.getByText('DJ Mate')).toBeTruthy();
    expect(screen.getByLabelText('Remove')).toBeTruthy();
    expect(screen.getByLabelText('Report')).toBeTruthy();
    // The sharing toggle is on the tab itself, not buried in settings.
    expect(screen.getByLabelText('Share my nights')).toBeTruthy();
  });

  it('shows where connections will be once nights load', async () => {
    serverReplies((op) => {
      if (op.table === 'my_connections') {
        return { data: [connection({})], error: null };
      }
      if (op.table === 'connection_nights') {
        return {
          data: [
            {
              other_id: 'p1',
              handle: 'djmate',
              stage_name: 'DJ Mate',
              avatar_url: null,
              occurrence_id: 'occ-1',
              starts_at: '2026-08-14T03:00:00Z',
              local_date: '2026-08-13',
              series_id: 'series-1',
              title: 'Tuesday Comedy Night',
              disciplines: ['comedy'],
              timezone: 'America/Los_Angeles',
              venue_name: 'The Blue Room',
              neighborhood: 'Capitol Hill',
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    });

    await render(<NetworkScreen />, { wrapper });

    expect(await screen.findByText('Where your people will be')).toBeTruthy();
    expect(await screen.findByText(/Tuesday Comedy Night/)).toBeTruthy();
    expect(screen.queryByText(/Nobody has said yes to an upcoming night yet/)).toBeNull();
  });
});
