import {
  DEFAULT_FILTERS,
  WEEKEND_DAYS,
  dayQuickPick,
  filtersToRpcArgs,
  hasActiveFilters,
  isoWeekday,
  sheetFilterCount,
  useFiltersStore,
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

describe('useFiltersStore setMethods', () => {
  it('replaces the whole method selection at once', () => {
    useFiltersStore.getState().setMethods(['lottery', 'reserved_slot']);
    expect(useFiltersStore.getState().methods).toEqual(['lottery', 'reserved_slot']);
    useFiltersStore.getState().setMethods([]);
    expect(useFiltersStore.getState().methods).toEqual([]);
  });
});

describe('the filters store', () => {
  beforeEach(() => {
    useFiltersStore.setState({
      ...DEFAULT_FILTERS,
      view: 'list',
      disciplinesSeeded: false,
    });
  });

  const state = () => useFiltersStore.getState();

  it('seeds discipline chips from what the performer does', () => {
    // What you do is what you see first, once.
    state().seedDisciplines(['comedy', 'poetry']);
    expect(state().disciplines).toEqual(['comedy', 'poetry']);
    expect(state().disciplinesSeeded).toBe(true);
  });

  it('never overrides a choice the person already made', () => {
    // The whole point of the guard: seeding runs on a profile load, which can
    // land after somebody has already tapped a chip.
    state().toggleDiscipline('music');
    state().seedDisciplines(['comedy', 'poetry']);
    expect(state().disciplines).toEqual(['music']);
    expect(state().disciplinesSeeded).toBe(true);
  });

  it('does not seed twice, even after the person clears the chips', () => {
    // Clearing back to "All" is a choice too, and re-seeding would undo it.
    state().seedDisciplines(['comedy']);
    state().selectDiscipline(null);
    expect(state().disciplines).toEqual([]);
    state().seedDisciplines(['comedy']);
    expect(state().disciplines).toEqual([]);
  });

  it('toggles a discipline on and back off', () => {
    state().toggleDiscipline('music');
    expect(state().disciplines).toEqual(['music']);
    state().toggleDiscipline('music');
    expect(state().disciplines).toEqual([]);
  });

  it('replaces the whole selection on a single tap pick', () => {
    state().toggleDiscipline('music');
    state().toggleDiscipline('poetry');
    state().selectDiscipline('comedy');
    expect(state().disciplines).toEqual(['comedy']);
  });

  it('toggles days and methods the same way', () => {
    state().toggleDay(2);
    state().toggleDay(5);
    expect(state().days).toEqual([2, 5]);
    state().toggleDay(2);
    expect(state().days).toEqual([5]);

    state().toggleMethod('lottery');
    expect(state().methods).toEqual(['lottery']);
    state().toggleMethod('lottery');
    expect(state().methods).toEqual([]);
  });

  it('puts everything back on reset', () => {
    state().toggleDiscipline('music');
    state().setDays([1, 2, 3]);
    state().setRadiusKm(5);
    state().setFreeOnly(true);
    state().setMethods(['lottery']);
    state().setTimeOfDay('late');
    state().reset();
    expect({
      disciplines: state().disciplines,
      days: state().days,
      radiusKm: state().radiusKm,
      freeOnly: state().freeOnly,
      methods: state().methods,
      timeOfDay: state().timeOfDay,
    }).toEqual(DEFAULT_FILTERS);
  });

  it('leaves the shared defaults object untouched', () => {
    // The store spreads DEFAULT_FILTERS, which is shallow, so the arrays are
    // the same instances. Every action has to replace rather than mutate, or
    // the defaults themselves drift for the rest of the session.
    state().toggleDiscipline('music');
    state().toggleDay(3);
    state().toggleMethod('lottery');
    state().reset();
    expect(DEFAULT_FILTERS.disciplines).toEqual([]);
    expect(DEFAULT_FILTERS.days).toEqual([]);
    expect(DEFAULT_FILTERS.methods).toEqual([]);
  });

  it('keeps the view separate from the filters', () => {
    state().setView('map');
    state().reset();
    expect(state().view).toBe('map');
  });
});
