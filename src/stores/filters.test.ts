import {
  DEFAULT_FILTERS,
  WEEKEND_DAYS,
  activeFilterCount,
  filtersToDiscoverArgs,
  hasActiveFilters,
  isoWeekday,
  sheetFilterCount,
  useFiltersStore,
  whenToWindow,
} from './filters';

const CENTER = { lat: 47.6174, lng: -122.3199 };
// A Tuesday, mid-afternoon local time.
const NOW = new Date(2026, 7, 4, 15, 0, 0);

describe('whenToWindow', () => {
  it('maps tonight and tomorrow to single local dates', () => {
    expect(whenToWindow('tonight', NOW)).toEqual({ from: '2026-08-04', to: '2026-08-04' });
    expect(whenToWindow('tomorrow', NOW)).toEqual({ from: '2026-08-05', to: '2026-08-05' });
  });

  it('maps this week to a seven day window', () => {
    expect(whenToWindow('week', NOW)).toEqual({ from: '2026-08-04', to: '2026-08-10' });
  });

  it('maps the weekend to Friday through Sunday of this week', () => {
    expect(whenToWindow('weekend', NOW)).toEqual({
      from: '2026-08-04',
      to: '2026-08-09', // upcoming Sunday
      days: WEEKEND_DAYS,
    });
  });

  it('keeps the weekend window honest when today is Sunday', () => {
    const sunday = new Date(2026, 7, 9, 12, 0, 0);
    expect(whenToWindow('weekend', sunday)).toEqual({
      from: '2026-08-09',
      to: '2026-08-09',
      days: WEEKEND_DAYS,
    });
  });

  it('is empty with no quick pick', () => {
    expect(whenToWindow(null, NOW)).toEqual({});
  });
});

describe('filtersToDiscoverArgs', () => {
  it('maps defaults to a plain browse query', () => {
    const args = filtersToDiscoverArgs(DEFAULT_FILTERS, CENTER, '', NOW);
    expect(args.p_query).toBeUndefined();
    expect(args.p_lat).toBe(CENTER.lat);
    expect(args.p_radius_m).toBe(40000);
    expect(args.p_disciplines).toBeUndefined();
    expect(args.p_days).toBeUndefined();
    expect(args.p_local_from).toBeUndefined();
    expect(args.p_free_only).toBe(false);
    expect(args.p_ages).toBeUndefined();
    expect(args.p_start_hour).toBeUndefined();
  });

  it('passes the trimmed query text through', () => {
    expect(filtersToDiscoverArgs(DEFAULT_FILTERS, CENTER, '  olympia  ', NOW).p_query).toBe(
      'olympia',
    );
    expect(filtersToDiscoverArgs(DEFAULT_FILTERS, CENTER, '   ', NOW).p_query).toBeUndefined();
  });

  it('works without a center', () => {
    const args = filtersToDiscoverArgs(DEFAULT_FILTERS, null, 'olympia', NOW);
    expect(args.p_lat).toBeUndefined();
    expect(args.p_lng).toBeUndefined();
  });

  it('passes selected filters through', () => {
    const args = filtersToDiscoverArgs(
      {
        ...DEFAULT_FILTERS,
        disciplines: ['comedy'],
        days: [2, 4],
        radiusKm: 10,
        freeOnly: true,
        methods: ['lottery'],
        ages: ['all_ages'],
        timeOfDay: 'late',
      },
      CENTER,
      '',
      NOW,
    );
    expect(args.p_radius_m).toBe(10000);
    expect(args.p_disciplines).toEqual(['comedy']);
    expect(args.p_days).toEqual([2, 4]);
    expect(args.p_free_only).toBe(true);
    expect(args.p_methods).toEqual(['lottery']);
    expect(args.p_ages).toEqual(['all_ages']);
    expect(args.p_start_hour).toBe(21);
    expect(args.p_end_hour).toBe(24);
  });

  it('turns the When quick pick into the venue-local date window', () => {
    const args = filtersToDiscoverArgs({ ...DEFAULT_FILTERS, when: 'tonight' }, CENTER, '', NOW);
    expect(args.p_local_from).toBe('2026-08-04');
    expect(args.p_local_to).toBe('2026-08-04');
    expect(args.p_days).toBeUndefined();
  });

  it('sends the weekend as a window plus weekday set', () => {
    const args = filtersToDiscoverArgs({ ...DEFAULT_FILTERS, when: 'weekend' }, CENTER, '', NOW);
    expect(args.p_days).toEqual(WEEKEND_DAYS);
    expect(args.p_local_to).toBe('2026-08-09');
  });
});

describe('hasActiveFilters', () => {
  it('is false for defaults and true for any deviation', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, freeOnly: true })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, radiusKm: 15 })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, disciplines: ['music'] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, when: 'tonight' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, ages: ['all_ages'] })).toBe(true);
  });
});

describe('isoWeekday', () => {
  it('maps Sunday to 7 and Monday to 1', () => {
    expect(isoWeekday(new Date(2026, 6, 26))).toBe(7); // Sunday July 26 2026
    expect(isoWeekday(new Date(2026, 6, 27))).toBe(1); // Monday July 27 2026
  });
});

describe('sheetFilterCount', () => {
  it('is zero at defaults and ignores bar-level filters', () => {
    expect(sheetFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(sheetFilterCount({ ...DEFAULT_FILTERS, when: 'tonight' })).toBe(0);
    expect(sheetFilterCount({ ...DEFAULT_FILTERS, freeOnly: true })).toBe(0);
  });
  it('counts sheet filters', () => {
    expect(sheetFilterCount({ ...DEFAULT_FILTERS, days: [3] })).toBe(1);
    expect(sheetFilterCount({ ...DEFAULT_FILTERS, timeOfDay: 'late' })).toBe(1);
    expect(sheetFilterCount({ ...DEFAULT_FILTERS, ages: ['all_ages'] })).toBe(1);
    expect(
      sheetFilterCount({ ...DEFAULT_FILTERS, methods: ['lottery', 'first_come'], radiusKm: 8 }),
    ).toBe(3);
  });
});

describe('activeFilterCount', () => {
  it('is zero at defaults', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });
  it('counts main filters the advanced count ignores', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, when: 'tonight' })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, freeOnly: true })).toBe(1);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, disciplines: ['music', 'comedy'] })).toBe(2);
  });
  it('adds the advanced filters on top', () => {
    expect(
      activeFilterCount({
        ...DEFAULT_FILTERS,
        disciplines: ['music'],
        when: 'tonight',
        freeOnly: true,
        timeOfDay: 'late',
        radiusKm: 8,
      }),
    ).toBe(5);
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
    state().seedDisciplines(['comedy', 'poetry']);
    expect(state().disciplines).toEqual(['comedy', 'poetry']);
    expect(state().disciplinesSeeded).toBe(true);
  });

  it('never overrides a choice the person already made', () => {
    state().toggleDiscipline('music');
    state().seedDisciplines(['comedy', 'poetry']);
    expect(state().disciplines).toEqual(['music']);
    expect(state().disciplinesSeeded).toBe(true);
  });

  it('does not seed twice, even after the person clears the chips', () => {
    state().seedDisciplines(['comedy']);
    state().selectDiscipline(null);
    expect(state().disciplines).toEqual([]);
    state().seedDisciplines(['comedy']);
    expect(state().disciplines).toEqual([]);
  });

  it('makes the When quick pick and hand-picked days displace each other', () => {
    state().setWhen('tonight');
    expect(state().when).toBe('tonight');
    state().toggleDay(2);
    expect(state().when).toBeNull();
    expect(state().days).toEqual([2]);
    state().setWhen('weekend');
    expect(state().days).toEqual([]);
  });

  it('toggles ages like the other multi-selects', () => {
    state().toggleAge('all_ages');
    expect(state().ages).toEqual(['all_ages']);
    state().toggleAge('all_ages');
    expect(state().ages).toEqual([]);
  });

  it('puts everything back on reset', () => {
    state().toggleDiscipline('music');
    state().setWhen('tonight');
    state().setDays([1, 2, 3]);
    state().setRadiusKm(5);
    state().setFreeOnly(true);
    state().setMethods(['lottery']);
    state().toggleAge('twenty_one_plus');
    state().setTimeOfDay('late');
    state().reset();
    expect({
      disciplines: state().disciplines,
      when: state().when,
      days: state().days,
      radiusKm: state().radiusKm,
      freeOnly: state().freeOnly,
      methods: state().methods,
      ages: state().ages,
      timeOfDay: state().timeOfDay,
    }).toEqual(DEFAULT_FILTERS);
  });

  it('leaves the shared defaults object untouched', () => {
    state().toggleDiscipline('music');
    state().toggleDay(3);
    state().toggleMethod('lottery');
    state().toggleAge('all_ages');
    state().reset();
    expect(DEFAULT_FILTERS.disciplines).toEqual([]);
    expect(DEFAULT_FILTERS.days).toEqual([]);
    expect(DEFAULT_FILTERS.methods).toEqual([]);
    expect(DEFAULT_FILTERS.ages).toEqual([]);
  });

  it('keeps the view separate from the filters', () => {
    state().setView('map');
    state().reset();
    expect(state().view).toBe('map');
  });
});
