/**
 * Timezones a producer can pick for a listing. IANA names only, never UTC
 * offsets: an open mic is a local-time recurring event and DST must follow
 * the venue's zone. US zones cover the launch footprint; the list grows
 * with the app's regions.
 */
export const TIMEZONE_CHOICES: { value: string; label: string }[] = [
  { value: 'America/Los_Angeles', label: 'Pacific (Seattle, Portland, LA)' },
  { value: 'America/Denver', label: 'Mountain (Denver, Boise)' },
  { value: 'America/Phoenix', label: 'Arizona (no daylight saving)' },
  { value: 'America/Chicago', label: 'Central (Chicago, Austin)' },
  { value: 'America/New_York', label: 'Eastern (New York, Atlanta)' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
];

export const FALLBACK_TIMEZONE = 'America/Los_Angeles';

/**
 * The zone a new listing starts on: the device's zone when it is one we
 * offer, otherwise the launch-region fallback. Producers list mics in the
 * city they live in, so the device zone is right nearly every time.
 */
export function defaultTimezone(deviceZone?: string | null): string {
  const zone = deviceZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONE_CHOICES.some((c) => c.value === zone) ? zone : FALLBACK_TIMEZONE;
}

/** Keeps an already-stored zone selectable even if it is not in the list. */
export function timezoneOptions(current?: string | null): { value: string; label: string }[] {
  if (!current || TIMEZONE_CHOICES.some((c) => c.value === current)) {
    return TIMEZONE_CHOICES;
  }
  return [{ value: current, label: current }, ...TIMEZONE_CHOICES];
}
