import { formatNextDate, formatNextDateLong } from './date-label';

const LA = 'America/Los_Angeles';
const CHI = 'America/Chicago';

describe('formatNextDate', () => {
  it('says Tonight for an evening show later the same venue day', () => {
    const now = new Date('2026-08-03T20:00:00Z'); // 1 PM in LA
    expect(formatNextDate('2026-08-04T03:00:00Z', LA, now)).toBe('Tonight · 8:00 PM');
  });

  it('says Today for a daytime show the same venue day', () => {
    const now = new Date('2026-08-03T16:00:00Z'); // 9 AM in LA
    expect(formatNextDate('2026-08-03T21:00:00Z', LA, now)).toBe('Today · 2:00 PM');
  });

  it('says Tomorrow across the venue midnight boundary', () => {
    const now = new Date('2026-08-04T05:00:00Z'); // Aug 3, 10 PM in LA
    expect(formatNextDate('2026-08-05T03:00:00Z', LA, now)).toBe('Tomorrow · 8:00 PM');
  });

  it('uses the venue timezone, not the device, to decide Tonight', () => {
    // 11:30 PM Aug 3 in Chicago is 9:30 PM Aug 3 in LA. A Chicago show at
    // 12:30 AM Aug 4 Chicago time is tomorrow at the venue.
    const now = new Date('2026-08-04T04:30:00Z');
    expect(formatNextDate('2026-08-04T05:30:00Z', CHI, now)).toMatch(/^Tomorrow/);
    expect(formatNextDate('2026-08-04T05:30:00Z', LA, now)).toMatch(/^Tonight/);
  });

  it('says Tomorrow across the fall DST transition', () => {
    // Oct 31 2026, 8 PM PDT; the show is Nov 1, 8 PM PST (25 hours later).
    const now = new Date('2026-11-01T03:00:00Z');
    expect(formatNextDate('2026-11-02T04:00:00Z', LA, now)).toBe('Tomorrow · 8:00 PM');
  });

  it('falls back to the weekday form beyond tomorrow', () => {
    const now = new Date('2026-08-03T20:00:00Z');
    expect(formatNextDate('2026-08-08T03:00:00Z', LA, now)).toMatch(/Fri, Aug 7/);
    expect(formatNextDateLong('2026-08-08T03:00:00Z', LA, now)).toMatch(/Friday, August 7/);
  });

  it('handles a missing date and an unknown zone without crashing', () => {
    expect(formatNextDate(null)).toBe('No upcoming date');
    const now = new Date('2026-08-03T20:00:00Z');
    expect(formatNextDate('2026-08-04T03:00:00Z', 'Not/AZone', now)).toBeTruthy();
  });
});
