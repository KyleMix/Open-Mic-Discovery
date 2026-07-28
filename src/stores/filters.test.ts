import { DEFAULT_FILTERS, filtersToRpcArgs, hasActiveFilters } from './filters';

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
