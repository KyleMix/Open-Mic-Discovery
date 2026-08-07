import { describeRecurrence } from '@/features/discovery/recurrence';

import { buildRrule, computeAnchorDate, parseRrule, type RecurrenceChoice } from './rrule-builder';

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

describe('parseRrule', () => {
  // The inverse of buildRrule, and the one that runs when a producer opens an
  // existing mic to edit it. If it misreads the rule, the form prefills with
  // a different schedule and saving silently moves every future night.
  it('reads back weekly rules', () => {
    expect(parseRrule('FREQ=WEEKLY;BYDAY=TU')).toEqual({ kind: 'weekly', days: ['TU'] });
    expect(parseRrule('FREQ=WEEKLY;BYDAY=MO,WE')).toEqual({ kind: 'weekly', days: ['MO', 'WE'] });
  });

  it('tells biweekly apart from weekly by its interval', () => {
    expect(parseRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=SA')).toEqual({
      kind: 'biweekly',
      days: ['SA'],
    });
    expect(parseRrule('FREQ=WEEKLY;INTERVAL=1;BYDAY=SA')).toEqual({ kind: 'weekly', days: ['SA'] });
  });

  it('reads back monthly ordinals, including last', () => {
    expect(parseRrule('FREQ=MONTHLY;BYDAY=1FR')).toEqual({
      kind: 'monthly',
      ordinals: ['1'],
      day: 'FR',
    });
    expect(parseRrule('FREQ=MONTHLY;BYDAY=1SU,3SU')).toEqual({
      kind: 'monthly',
      ordinals: ['1', '3'],
      day: 'SU',
    });
    expect(parseRrule('FREQ=MONTHLY;BYDAY=-1TH')).toEqual({
      kind: 'monthly',
      ordinals: ['-1'],
      day: 'TH',
    });
  });

  it('is not case sensitive, because the column is free text', () => {
    expect(parseRrule('freq=weekly;byday=tu')).toEqual({ kind: 'weekly', days: ['TU'] });
  });

  it('refuses anything it cannot represent rather than guessing', () => {
    // Guessing here would show a producer a schedule that is not theirs.
    expect(parseRrule('FREQ=WEEKLY;INTERVAL=3;BYDAY=TU')).toBeNull(); // every third week
    expect(parseRrule('FREQ=DAILY')).toBeNull();
    expect(parseRrule('FREQ=WEEKLY')).toBeNull(); // no days
    expect(parseRrule('FREQ=WEEKLY;BYDAY=XX')).toBeNull(); // not a weekday
    expect(parseRrule('FREQ=WEEKLY;BYDAY=TU,XX')).toBeNull(); // one bad day poisons it
    expect(parseRrule('FREQ=MONTHLY;BYDAY=5FR')).toBeNull(); // no fifth week
    expect(parseRrule('FREQ=MONTHLY;BYDAY=1FR,2SA')).toBeNull(); // two weekdays
    expect(parseRrule('FREQ=MONTHLY')).toBeNull();
    expect(parseRrule('')).toBeNull();
    expect(parseRrule('nonsense')).toBeNull();
  });

  it('round-trips everything buildRrule can produce', () => {
    // The two have to agree, or editing a mic changes it.
    const choices: RecurrenceChoice[] = [
      { kind: 'weekly', days: ['MO'] },
      { kind: 'weekly', days: ['MO', 'WE', 'FR'] },
      { kind: 'weekly', days: ['SU'] },
      { kind: 'biweekly', days: ['TH'] },
      { kind: 'biweekly', days: ['SA', 'SU'] },
      { kind: 'monthly', ordinals: ['1'], day: 'TU' },
      { kind: 'monthly', ordinals: ['1', '2', '3', '4'], day: 'WE' },
      { kind: 'monthly', ordinals: ['-1'], day: 'FR' },
    ];
    for (const choice of choices) {
      expect(parseRrule(buildRrule(choice)!)).toEqual(choice);
    }
  });
});

describe('computeAnchorDate takes the producer local date, not the UTC one', () => {
  // Regression. toISOString() converts to UTC first, so an evening west of
  // Greenwich reported tomorrow. On a Sunday that crosses an ISO week
  // boundary, and the generator computes biweekly parity per ISO week, so
  // every alternate week of the schedule came out inverted. Proven against
  // private.rrule_matches: anchoring Sunday 2026-08-02 to Monday the 3rd
  // moved the mic off the 2nd, 16th and 30th and onto the 9th and 23rd.
  const SUNDAY_EVENING_IN_SEATTLE = new Date(2026, 7, 2, 20, 0, 0);

  it('keeps a Sunday evening on Sunday', () => {
    expect(computeAnchorDate({ kind: 'biweekly', days: ['SU'] }, SUNDAY_EVENING_IN_SEATTLE)).toBe(
      '2026-08-02',
    );
  });

  it('keeps it on Sunday for a weekly mic too', () => {
    expect(computeAnchorDate({ kind: 'weekly', days: ['SU'] }, SUNDAY_EVENING_IN_SEATTLE)).toBe(
      '2026-08-02',
    );
  });

  it('still shifts a week when a biweekly mic starts next week', () => {
    expect(
      computeAnchorDate({ kind: 'biweekly', days: ['SU'] }, SUNDAY_EVENING_IN_SEATTLE, true),
    ).toBe('2026-08-09');
  });

  it('pads single-digit months and days, so the date stays sortable', () => {
    expect(computeAnchorDate({ kind: 'weekly', days: ['FR'] }, new Date(2026, 0, 9, 23, 30))).toBe(
      '2026-01-09',
    );
  });

  it('does not roll over at midday, when UTC and local agree', () => {
    expect(computeAnchorDate({ kind: 'weekly', days: ['TU'] }, new Date(2026, 6, 28, 12, 0))).toBe(
      '2026-07-28',
    );
  });
});

describe('computeAnchorDate takes the venue date, not the device one', () => {
  // The second half of the same bug. Using the device date fixed the UTC
  // case and is still wrong across zones, because the server never reads
  // this column in the device zone: private.generate_occurrences starts from
  // `(now() at time zone series.timezone)::date`.
  //
  // Built from Date.UTC, not from local components. CI runs this suite twice,
  // once under UTC and once under America/Los_Angeles, so a fixture written
  // as `new Date(2026, 7, 2, 22, 0, 0)` would be a different instant in each
  // run and these expectations would only hold in one of them. The whole
  // point of the assertions below is that the venue zone decides, so the
  // fixture must not smuggle the host zone in.
  //
  // 2026-08-03T05:00Z is Sunday 22:00 in Seattle and Monday 01:00 in New
  // York: one instant, two calendar days, which is the case at issue.
  const SUNDAY_LATE_IN_SEATTLE = new Date(Date.UTC(2026, 7, 3, 5, 0, 0));

  it('anchors a New York mic to Monday when it is already Monday there', () => {
    // Anchoring to Sunday would put the anchor in the previous ISO week from
    // the generator's point of view and invert every alternate night of a
    // biweekly run.
    expect(
      computeAnchorDate(
        { kind: 'biweekly', days: ['MO'] },
        SUNDAY_LATE_IN_SEATTLE,
        false,
        'America/New_York',
      ),
    ).toBe('2026-08-03');
  });

  it('leaves a Seattle mic on Sunday, because there it still is Sunday', () => {
    expect(
      computeAnchorDate(
        { kind: 'biweekly', days: ['SU'] },
        SUNDAY_LATE_IN_SEATTLE,
        false,
        'America/Los_Angeles',
      ),
    ).toBe('2026-08-02');
  });

  it('still shifts a whole week for a biweekly mic that starts next week', () => {
    expect(
      computeAnchorDate(
        { kind: 'biweekly', days: ['MO'] },
        SUNDAY_LATE_IN_SEATTLE,
        true,
        'America/New_York',
      ),
    ).toBe('2026-08-10');
  });

  // The two fallbacks cannot assert a literal date without pinning the host
  // zone, which is the coupling CI's second run exists to catch. They assert
  // the shape and the equivalence instead, which is the actual contract:
  // an unusable zone behaves exactly as no zone, and neither throws.
  it('falls back to the device date when no zone is known yet', () => {
    expect(
      computeAnchorDate({ kind: 'weekly', days: ['SU'] }, SUNDAY_LATE_IN_SEATTLE, false),
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('treats a bad zone name as no zone rather than throwing', () => {
    expect(
      computeAnchorDate(
        { kind: 'weekly', days: ['SU'] },
        SUNDAY_LATE_IN_SEATTLE,
        false,
        'Not/AZone',
      ),
    ).toBe(computeAnchorDate({ kind: 'weekly', days: ['SU'] }, SUNDAY_LATE_IN_SEATTLE, false));
  });
});
