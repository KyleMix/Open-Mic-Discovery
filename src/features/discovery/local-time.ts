/**
 * Occurrence timestamps are timestamptz; a mic happens at its venue's local
 * time. Rendering with the device locale alone shifts the date for anyone
 * whose device is not in the mic's zone (a Thursday 7:30 PM Seattle mic
 * reads "Friday" from UTC). Always pass the mic's IANA timezone through
 * these helpers so dates and times read as the venue experiences them.
 */

type ZoneOptions = Intl.DateTimeFormatOptions;

function inZone(iso: string, timezone: string | null | undefined, options: ZoneOptions): string {
  const date = new Date(iso);
  try {
    return date.toLocaleString(undefined, { ...options, timeZone: timezone || undefined });
  } catch {
    // An unknown zone name should never hide the date entirely.
    return date.toLocaleString(undefined, options);
  }
}

/** "Friday, July 31" style, in the mic's zone. */
export function eventDate(
  iso: string,
  timezone: string | null | undefined,
  options: ZoneOptions = { weekday: 'long', month: 'long', day: 'numeric' },
): string {
  return inZone(iso, timezone, options);
}

/** "Thu, Jul 30" style, in the mic's zone. */
export function eventDateShort(iso: string, timezone: string | null | undefined): string {
  return inZone(iso, timezone, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "7:00 PM" style, in the mic's zone. */
export function eventTime(iso: string, timezone: string | null | undefined): string {
  return inZone(iso, timezone, { hour: 'numeric', minute: '2-digit' });
}
