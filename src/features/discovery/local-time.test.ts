import { eventDate, eventDateShort, eventTime } from './local-time';

// Thursday July 30 2026, 7:30 PM in Los Angeles == 02:30 UTC on Friday.
const THURSDAY_NIGHT_PACIFIC = '2026-07-31T02:30:00Z';

describe('event date and time rendering', () => {
  it('keeps the date on the venue side of midnight', () => {
    expect(eventDate(THURSDAY_NIGHT_PACIFIC, 'America/Los_Angeles')).toContain('Thursday');
    expect(eventDateShort(THURSDAY_NIGHT_PACIFIC, 'America/Los_Angeles')).toContain('Thu');
  });

  it('renders the clock time of the venue, not the viewer', () => {
    expect(eventTime(THURSDAY_NIGHT_PACIFIC, 'America/Los_Angeles')).toMatch(/7:30/);
  });

  it('falls back gracefully for a missing or broken zone', () => {
    expect(eventDate(THURSDAY_NIGHT_PACIFIC, null)).toBeTruthy();
    expect(eventDate(THURSDAY_NIGHT_PACIFIC, 'Not/AZone')).toBeTruthy();
  });
});
