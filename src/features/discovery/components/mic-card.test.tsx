import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { createTestQueryClient } from '@/test/query-harness';

import { MicCard, type MicCardMic } from './mic-card';
import type { DiscoverResult } from '@/features/discovery/queries';

// The card carries the favorite star, which reads the session and the
// favorites query; a signed-out session keeps both quiet in this test.
jest.mock('@/features/auth/session', () => ({ useSession: () => ({ session: null }) }));
jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));

// createTestQueryClient rather than a hand-rolled client: this one set
// retry: false but took the default five minute gcTime, which schedules a timer
// per cache entry and kept the Jest worker alive. See src/test/query-harness.tsx.
function renderCard(element: ReactElement) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>{element}</QueryClientProvider>,
  );
}

/**
 * Shaped like a row from search_discover. Typing this as DiscoverResult is
 * the point: if the feed ever stops returning something the card draws,
 * this file stops compiling instead of quietly rendering a thinner card
 * the way it used to.
 */
const SEARCH_ROW: DiscoverResult = {
  series_id: 'series-1',
  title: 'The Log Cabin',
  disciplines: ['comedy'],
  description: null as unknown as string,
  signup_method: 'first_come',
  cost_cents: 0,
  set_length_minutes: null as unknown as number,
  rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
  start_time: '19:00:00',
  timezone: 'America/Los_Angeles',
  is_active: true,
  last_confirmed_at: new Date().toISOString(),
  venue_id: 'venue-1',
  venue_name: 'The Log Cabin',
  neighborhood: 'Downtown',
  city: 'Olympia',
  region: 'WA',
  lat: 47.0379,
  lng: -122.9007,
  distance_m: 2253,
  next_occurrence_id: null as unknown as string,
  next_starts_at: '2026-08-11T02:00:00.000Z',
  next_local_date: null as unknown as string,
  next_status: null as unknown as DiscoverResult['next_status'],
  poster_url: null as unknown as string,
  featured_name: null as unknown as string,
  host_name: null as unknown as string,
  capacity: null as unknown as number,
  spots_left: null as unknown as number,
  owner_id: null as unknown as string,
  match_kind: 'text',
  rank_score: 5.1,
  cancelled_next_starts_at: null as unknown as string,
};

describe('MicCard from a search result', () => {
  it('renders the same details a nearby result shows', async () => {
    // A search row satisfies the card's prop type by structure alone.
    const mic: MicCardMic = SEARCH_ROW;
    await renderCard(<MicCard mic={mic} onPress={jest.fn()} />);

    expect(screen.getByText('The Log Cabin')).toBeTruthy();
    // Schedule, not just the next date: this was missing from search results.
    expect(screen.getByText(/Every other Monday, 7:00\s?PM/i)).toBeTruthy();
    // Signup method, cost, and freshness were all missing too.
    expect(screen.getByText('Walk-in list')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText(/Confirmed today/i)).toBeTruthy();
    // Neighborhood and distance in one line.
    expect(screen.getByText(/The Log Cabin, Downtown \(1\.4 mi\)/)).toBeTruthy();
  });

  it('labels the card for screen readers with the mic and venue', async () => {
    await renderCard(<MicCard mic={SEARCH_ROW} onPress={jest.fn()} />);
    expect(screen.getByLabelText(/^The Log Cabin at The Log Cabin\./)).toBeTruthy();
  });

  it('names the guest when the night has one, since that is the draw', async () => {
    await renderCard(
      <MicCard mic={{ ...SEARCH_ROW, featured_name: 'Nia Guest' }} onPress={jest.fn()} />,
    );
    expect(screen.getByText('Featuring Nia Guest')).toBeTruthy();
  });

  it('and says nothing at all when it does not', async () => {
    await renderCard(<MicCard mic={SEARCH_ROW} onPress={jest.fn()} />);
    expect(screen.queryByText(/Featuring/)).toBeNull();
  });

  it('names the host when the listing credits one', async () => {
    await renderCard(
      <MicCard mic={{ ...SEARCH_ROW, host_name: 'Maggie McCrary' }} onPress={jest.fn()} />,
    );
    expect(screen.getByText('Hosted by Maggie McCrary')).toBeTruthy();
  });

  it('shows no host line when nobody is credited', async () => {
    await renderCard(<MicCard mic={SEARCH_ROW} onPress={jest.fn()} />);
    expect(screen.queryByText(/Hosted by/)).toBeNull();
  });

  it('reads both names to screen readers along with the rest of the card', async () => {
    await renderCard(
      <MicCard
        mic={{ ...SEARCH_ROW, featured_name: 'Nia Guest', host_name: 'Maggie McCrary' }}
        onPress={jest.fn()}
      />,
    );
    expect(
      screen.getByLabelText(/Featuring Nia Guest\. Hosted by Maggie McCrary\./),
    ).toBeTruthy();
  });
});
