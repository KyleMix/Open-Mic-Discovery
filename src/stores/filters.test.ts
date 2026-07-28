import {
  DEFAULT_FILTERS,
  WEEKEND_DAYS,
  dayQuickPick,
  filtersToRpcArgs,
  hasActiveFilters,
  isoWeekday,
  sheetFilterCount,
} from './filters';

const CENTER = { lat: 47.6174, lng: -122.3199 };

describe('filtersToRpcArgs', () => {
  it('maps defaults to a plain radius query', () => {
    const args = filtersToRpcArgs(DEFAULT_FILTERS, CENTER);
    expect(args.p_lat).toBe(CENTER.lat);
    expect(args.p_radius_m).toBe(40000);
    expect(args.p_disciplines).toBeUndefined();
    expect(args.p_days).toBeUndefined();
    expect(args.p_free_only).toBe(false);
    expect(args.p_start_hour).toBeUndefined();
  });

  it('passes selected filters through', () => {
    const args = filtersToRpcArgs(
      {
        ...DEFAULT_FILTERS,
        disciplines: ['comedy'],
        days: [2, 4],
        radiusKm: 10,
        freeOnly: true,
        methods: ['lottery'],
        timeOfDay: 'late',
      },
      CENTER,
    );
    expect(args.p_radius_m).toBe(10000);
    expect(args.p_disciplines).toEqual(['comedy']);
    expect(args.p_days).toEqual([2, 4]);
    expect(args.p_free_only).toBe(true);
    expect(args.p_methods).toEqual(['lottery']);
    expect(args.p_start_hour).toBe(21);
    expect(args.p_end_hour).toBe(24);
  });
});

describe('hasActiveFilters', () => {
  it('is false for defaults and true for any deviation', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, freeOnly: true })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, radiusKm: 15 })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, disciplines: ['music'] })).toBe(true);
  });
});

describe('isoWeekday', () => {
  it('maps Sunday to 7 and Monday to 1', () => {
    expect(isoWeekday(new Date(2026, 6, 26))).toBe(7); // Sunday July 26 2026
    expect(isoWeekday(new Date(2026, 6, 27))).toBe(1); // Monday July 27 2026
  });
});

describe('dayQuickPick', () => {
  const today = 2; // Tuesday
  it('recognizes the three quick picks', () => {
    expect(dayQuickPick([], today)).toBe('any');
    expect(dayQuickPick([2], today)).toBe('today');
    expect(dayQuickPick([...WEEKEND_DAYS], today)).toBe('weekend');
    expect(dayQuickPick([7, 5, 6], today)).toBe('weekend');
  });
  it('treats anything else as custom', () => {
    expect(dayQuickPick([3], today)).toBe('custom');
    expect(dayQuickPick([5, 6], today)).toBe('custom');
  });
});

describe('sheetFilterCount', () => {
  const today = 2;
  it('is zero at defaults and ignores quick picks', () => {
    expect(sheetFilterCount(DEFAULT_FILTERS, today)).toBe(0);
    expect(sheetFilterCount({ ...DEFAULT_FILTERS, days: [2] }, today)).toBe(0);
    expect(sheetFilterCount({ ...DEFAULT_FILTERS, freeOnly: true }, today)).toBe(0);
  });
  it('counts sheet-only filters', () => {
    expect(sheetFilterCount({ ...DEFAULT_FILTERS, days: [3] }, today)).toBe(1);
    expect(sheetFilterCount({ ...DEFAULT_FILTERS, timeOfDay: 'late' }, today)).toBe(1);
    expect(
      sheetFilterCount(
        { ...DEFAULT_FILTERS, methods: ['lottery', 'first_come'], radiusKm: 8 },
        today,
      ),
    ).toBe(3);
  });
});
