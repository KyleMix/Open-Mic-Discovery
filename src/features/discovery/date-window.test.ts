import { boundByDate } from '@/features/discovery/date-window';

// A Tuesday evening. Local times keep the test timezone-independent.
const NOW = new Date(2026, 7, 4, 17, 0, 0); // Tue Aug 4 2026, 5:00 PM

function mic(next: Date | null) {
  return { next_starts_at: next ? next.toISOString() : null };
}

describe('boundByDate', () => {
  it('passes everything through with no bound', () => {
    const mics = [mic(new Date(2026, 7, 11, 20, 0))];
    expect(boundByDate(mics, null, NOW)).toEqual(mics);
  });

  describe('today', () => {
    it('keeps a mic happening tonight', () => {
      const tonight = mic(new Date(2026, 7, 4, 20, 0));
      expect(boundByDate([tonight], 'today', NOW)).toEqual([tonight]);
    });

    it('drops a same-weekday mic dated next week', () => {
      const nextTuesday = mic(new Date(2026, 7, 11, 20, 0));
      expect(boundByDate([nextTuesday], 'today', NOW)).toEqual([]);
    });

    it('drops a mic earlier today that already started', () => {
      const earlier = mic(new Date(2026, 7, 4, 12, 0));
      expect(boundByDate([earlier], 'today', NOW)).toEqual([]);
    });

    it('drops a mic with no upcoming date', () => {
      expect(boundByDate([mic(null)], 'today', NOW)).toEqual([]);
    });
  });

  describe('weekend', () => {
    it('keeps Friday through Sunday of this week', () => {
      const friday = mic(new Date(2026, 7, 7, 20, 0));
      const sunday = mic(new Date(2026, 7, 9, 19, 0));
      expect(boundByDate([friday, sunday], 'weekend', NOW)).toEqual([friday, sunday]);
    });

    it('drops a weeknight before the weekend and next weekend', () => {
      const thursday = mic(new Date(2026, 7, 6, 20, 0));
      const nextFriday = mic(new Date(2026, 7, 14, 20, 0));
      expect(boundByDate([thursday, nextFriday], 'weekend', NOW)).toEqual([]);
    });

    it('on a Sunday, keeps only the rest of that day', () => {
      const sundayAfternoon = new Date(2026, 7, 9, 14, 0);
      const tonight = mic(new Date(2026, 7, 9, 19, 0));
      const nextFriday = mic(new Date(2026, 7, 14, 20, 0));
      expect(boundByDate([tonight, nextFriday], 'weekend', sundayAfternoon)).toEqual([tonight]);
    });
  });
});
