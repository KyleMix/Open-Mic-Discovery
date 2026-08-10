import { rruleMatches } from './rrule-match';

// 2026-08-10 is a Monday.
describe('rruleMatches', () => {
  it('matches weekly BYDAY and nothing else', () => {
    expect(rruleMatches('FREQ=WEEKLY;BYDAY=MO', '2026-08-10', '2026-08-17')).toBe(true);
    expect(rruleMatches('FREQ=WEEKLY;BYDAY=MO', '2026-08-10', '2026-08-18')).toBe(false);
    expect(rruleMatches('FREQ=WEEKLY;BYDAY=TU,TH', '2026-08-10', '2026-08-18')).toBe(true);
  });

  it('keeps biweekly parity from the anchor week', () => {
    const rule = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO';
    expect(rruleMatches(rule, '2026-08-10', '2026-08-10')).toBe(true);
    expect(rruleMatches(rule, '2026-08-10', '2026-08-17')).toBe(false);
    expect(rruleMatches(rule, '2026-08-10', '2026-08-24')).toBe(true);
    // An anchor on Sunday still means the ISO week it sits in.
    expect(rruleMatches(rule, '2026-08-16', '2026-08-10')).toBe(true);
  });

  it('handles monthly ordinals, including from the month end', () => {
    // 2026-08-04 is the first Tuesday; 2026-08-25 the last.
    expect(rruleMatches('FREQ=MONTHLY;BYDAY=1TU', '2026-01-01', '2026-08-04')).toBe(true);
    expect(rruleMatches('FREQ=MONTHLY;BYDAY=1TU', '2026-01-01', '2026-08-11')).toBe(false);
    expect(rruleMatches('FREQ=MONTHLY;BYDAY=-1TU', '2026-01-01', '2026-08-25')).toBe(true);
    expect(rruleMatches('FREQ=MONTHLY;BYDAY=1TU,3TU', '2026-01-01', '2026-08-18')).toBe(true);
  });

  it('refuses what it does not understand', () => {
    expect(rruleMatches('FREQ=DAILY', '2026-08-10', '2026-08-11')).toBe(false);
    expect(rruleMatches('', '2026-08-10', '2026-08-11')).toBe(false);
  });
});
