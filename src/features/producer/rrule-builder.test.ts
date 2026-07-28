import { describeRecurrence } from '@/features/discovery/recurrence';

import { buildRrule, computeAnchorDate } from './rrule-builder';

describe('buildRrule', () => {
  it('builds weekly rules with sorted days', () => {
    expect(buildRrule({ kind: 'weekly', days: ['TU'] })).toBe('FREQ=WEEKLY;BYDAY=TU');
    expect(buildRrule({ kind: 'weekly', days: ['WE', 'MO'] })).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
  });

  it('builds biweekly rules', () => {
    expect(buildRrule({ kind: 'biweekly', days: ['SA'] })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=SA');
  });

  it('builds monthly ordinal rules including last', () => {
    expect(buildRrule({ kind: 'monthly', ordinals: ['1'], day: 'FR' })).toBe(
      'FREQ=MONTHLY;BYDAY=1FR',
    );
    expect(buildRrule({ kind: 'monthly', ordinals: ['3', '1'], day: 'SU' })).toBe(
      'FREQ=MONTHLY;BYDAY=1SU,3SU',
    );
    expect(buildRrule({ kind: 'monthly', ordinals: ['-1'], day: 'TH' })).toBe(
      'FREQ=MONTHLY;BYDAY=-1TH',
    );
  });

  it('returns null when the choice is incomplete', () => {
    expect(buildRrule({ kind: 'weekly', days: [] })).toBeNull();
    expect(buildRrule({ kind: 'monthly', ordinals: [], day: 'FR' })).toBeNull();
  });

  it('round-trips through the plain-English renderer', () => {
    const rrule = buildRrule({ kind: 'weekly', days: ['TU'] })!;
    expect(describeRecurrence(rrule, '20:00')).toBe('Every Tuesday, 8:00 PM');
    const monthly = buildRrule({ kind: 'monthly', ordinals: ['-1'], day: 'TH' })!;
    expect(describeRecurrence(monthly, '19:30')).toBe('Last Thursday of the month, 7:30 PM');
    const biweekly = buildRrule({ kind: 'biweekly', days: ['WE'] })!;
    expect(describeRecurrence(biweekly, '19:00')).toBe('Every other Wednesday, 7:00 PM');
  });
});

describe('computeAnchorDate', () => {
  const TODAY = new Date('2026-07-28T12:00:00Z');

  it('anchors to today by default', () => {
    expect(computeAnchorDate({ kind: 'weekly', days: ['TU'] }, TODAY)).toBe('2026-07-28');
  });

  it('shifts a week forward for biweekly starting next week', () => {
    expect(computeAnchorDate({ kind: 'biweekly', days: ['TU'] }, TODAY, true)).toBe('2026-08-04');
  });
});
