import { formatInZone } from './timezone';

// 2026-08-05T03:00:00Z is Aug 4, 8:00 PM in Los Angeles and 10:00 PM in Chicago.
const ISO = '2026-08-05T03:00:00Z';

describe('formatInZone', () => {
  it('formats the wall-clock time at the venue', () => {
    expect(
      formatInZone(ISO, 'America/Los_Angeles', { hour: 'numeric', minute: '2-digit' }),
    ).toMatch(/8:00/);
    expect(formatInZone(ISO, 'America/Chicago', { hour: 'numeric', minute: '2-digit' })).toMatch(
      /10:00/,
    );
  });

  it('keeps the venue-local calendar date', () => {
    expect(
      formatInZone(ISO, 'America/Los_Angeles', { month: 'short', day: 'numeric' }),
    ).toContain('4');
  });

  it('falls back to device-local on an unknown zone', () => {
    expect(() =>
      formatInZone(ISO, 'Not/AZone', { hour: 'numeric', minute: '2-digit' }),
    ).not.toThrow();
  });
});
