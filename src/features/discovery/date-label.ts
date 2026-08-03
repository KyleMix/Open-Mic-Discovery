import { formatInZone } from './timezone';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar day of an instant in the venue's zone, e.g. "2026-08-03". */
function dayKey(date: Date, timezone?: string | null): string {
  if (timezone) {
    try {
      return date.toLocaleDateString('en-CA', { timeZone: timezone });
    } catch {
      // Unknown zone on this runtime; device-local beats crashing.
    }
  }
  return date.toLocaleDateString('en-CA');
}

/** Hour of day (0 to 23) of an instant in the venue's zone. */
function hourInZone(date: Date, timezone?: string | null): number {
  const raw = formatInZone(date.toISOString(), timezone, { hour: 'numeric', hour12: false });
  const hour = parseInt(raw, 10);
  return Number.isNaN(hour) ? 20 : hour % 24;
}

type Style = 'short' | 'long' | 'day-only';

/**
 * A mic happening in four hours should read "Tonight", not "Fri, Mar 7".
 * Relative labels are computed against the venue's timezone so a Chicago
 * listing flips to Tomorrow on Chicago midnight, not the reader's.
 */
function relativeNextDate(
  startsAt: string | null,
  timezone: string | null | undefined,
  style: Style,
  now: Date,
): string {
  if (!startsAt) {
    return 'No upcoming date';
  }
  const date = new Date(startsAt);
  const target = dayKey(date, timezone);
  const withTime = style !== 'day-only';
  const time = formatInZone(startsAt, timezone, { hour: 'numeric', minute: '2-digit' });
  if (target === dayKey(now, timezone)) {
    // A 2 PM Sunday poetry mic is not "Tonight"; evening shows are.
    const day = hourInZone(date, timezone) >= 17 ? 'Tonight' : 'Today';
    return withTime ? `${day} · ${time}` : day;
  }
  if (target === dayKey(new Date(now.getTime() + DAY_MS), timezone)) {
    return withTime ? `Tomorrow · ${time}` : 'Tomorrow';
  }
  return formatInZone(
    startsAt,
    timezone,
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric' },
  );
}

/** Card, search row, and favorites form: "Tonight · 8:00 PM" or "Fri, Mar 7". */
export function formatNextDate(
  startsAt: string | null,
  timezone?: string | null,
  now: Date = new Date(),
): string {
  return relativeNextDate(startsAt, timezone, 'short', now);
}

/** Detail screen form: "Tonight · 8:00 PM" or "Friday, March 7". */
export function formatNextDateLong(
  startsAt: string | null,
  timezone?: string | null,
  now: Date = new Date(),
): string {
  return relativeNextDate(startsAt, timezone, 'long', now);
}

/** Tight columns (profile nights): "Tonight", "Tomorrow", or "Fri, Aug 7". */
export function formatRelativeDay(
  startsAt: string | null,
  timezone?: string | null,
  now: Date = new Date(),
): string {
  return relativeNextDate(startsAt, timezone, 'day-only', now);
}
