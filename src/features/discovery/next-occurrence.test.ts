import { nextOccurrence } from './next-occurrence';

type Row = { status: 'scheduled' | 'cancelled' | 'moved' | 'completed'; id: string };

const night = (id: string, status: Row['status']): Row => ({ id, status });

describe('nextOccurrence', () => {
  it('keeps an in-progress night at the front instead of flipping to next week', () => {
    // The query trails the clock, so a started night arrives first.
    const rows = [night('tonight', 'scheduled'), night('next-week', 'scheduled')];
    expect(nextOccurrence(rows)?.id).toBe('tonight');
  });

  it('moves on once the host has ended the show', () => {
    const rows = [night('tonight', 'completed'), night('next-week', 'scheduled')];
    expect(nextOccurrence(rows)?.id).toBe('next-week');
  });

  it('skips a cancelled night for the headline', () => {
    const rows = [night('tonight', 'cancelled'), night('next-week', 'scheduled')];
    expect(nextOccurrence(rows)?.id).toBe('next-week');
  });

  it('returns undefined when nothing is on', () => {
    expect(nextOccurrence([night('tonight', 'cancelled')])).toBeUndefined();
    expect(nextOccurrence([])).toBeUndefined();
  });
});
