import { render, screen } from '@testing-library/react-native';

import { MicCard, type MicCardMic } from './mic-card';
import type { SearchResult } from '@/features/discovery/queries';

/**
 * Shaped like a row from search_mics, not from mics_near. Typing this as
 * SearchResult is the point: if search ever stops returning something the card
 * draws, this file stops compiling instead of quietly rendering a thinner card
 * the way it used to.
 */
const SEARCH_ROW: SearchResult = {
  series_id: 'series-1',
  title: 'The Log Cabin',
  disciplines: ['comedy'],
  signup_method: 'first_come',
  cost_cents: 0,
  rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
  start_time: '19:00:00',
  timezone: 'America/Los_Angeles',
  last_confirmed_at: new Date().toISOString(),
  venue_id: 'venue-1',
  venue_name: 'The Log Cabin',
  neighborhood: 'Downtown',
  city: 'Olympia',
  region: 'WA',
  lat: 47.0379,
  lng: -122.9007,
  distance_m: 2253,
  next_starts_at: '2026-08-11T02:00:00.000Z',
  poster_url: null as unknown as string,
};

describe('MicCard from a search result', () => {
  it('renders the same details a nearby result shows', async () => {
    // A search row satisfies the card's prop type by structure alone.
    const mic: MicCardMic = SEARCH_ROW;
    await render(<MicCard mic={mic} onPress={jest.fn()} />);

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
    await render(<MicCard mic={SEARCH_ROW} onPress={jest.fn()} />);
    expect(screen.getByLabelText('The Log Cabin at The Log Cabin')).toBeTruthy();
  });
});
