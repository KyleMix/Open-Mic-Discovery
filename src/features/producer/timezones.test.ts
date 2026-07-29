import {
  FALLBACK_TIMEZONE,
  TIMEZONE_CHOICES,
  defaultTimezone,
  timezoneOptions,
} from './timezones';

describe('defaultTimezone', () => {
  it('uses the device zone when it is offered', () => {
    expect(defaultTimezone('America/New_York')).toBe('America/New_York');
    expect(defaultTimezone('Pacific/Honolulu')).toBe('Pacific/Honolulu');
  });

  it('falls back to the launch region for unknown zones', () => {
    expect(defaultTimezone('Europe/Berlin')).toBe(FALLBACK_TIMEZONE);
    expect(defaultTimezone('Not/AZone')).toBe(FALLBACK_TIMEZONE);
  });

  it('resolves the device zone itself when none is passed', () => {
    const zone = defaultTimezone();
    expect(TIMEZONE_CHOICES.some((c) => c.value === zone)).toBe(true);
  });
});

describe('timezoneOptions', () => {
  it('returns the standard list for offered or missing zones', () => {
    expect(timezoneOptions('America/Chicago')).toEqual(TIMEZONE_CHOICES);
    expect(timezoneOptions(null)).toEqual(TIMEZONE_CHOICES);
  });

  it('keeps a stored but unlisted zone selectable', () => {
    const options = timezoneOptions('America/Boise');
    expect(options[0]).toEqual({ value: 'America/Boise', label: 'America/Boise' });
    expect(options).toHaveLength(TIMEZONE_CHOICES.length + 1);
  });
});
