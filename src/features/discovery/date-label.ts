import { formatInZone } from './timezone';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The night rule: an open mic night runs until 5 AM. Both "now" and the
 * event are attributed to the evening their night began (instants are
 * shifted back 5 hours before taking the calendar day), so a 12:30 AM
 * show is still "Tonight" to someone browsing at 11 PM, not "Tomorrow".
 * A consequence, chosen deliberately: at 1 AM Saturday the app still
 * calls Friday's small hours "Tonight", and Saturday evening "Tomorrow",
 * matching how people awake at 1 AM talk about the night they are in.
 */
const NIGHT_ROLLOVER_HOURS = 5;

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

/** The instant shifted back so small-hours events belong to the prior evening. */
function nightAnchor(date: Date): Date {
  return new Date(date.getTime() - NIGHT_ROLLOVER_HOURS * 60 * 60 * 1000);
}

/** Whole days between two "YYYY-MM-DD" keys. */
function dayDiff(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(toKey) - Date.parse(fromKey)) / DAY_MS);
}

/** Hour of day (0 to 23) of an instant in the venue's zone. */
function hourInZone(date: Date, timezone?: string | null): number {
  const raw = formatInZone(date.toISOString(), timezone, { hour: 'numeric', hour12: false });
  const hour = parseInt(raw, 10);
  return Number.isNaN(hour) ? 20 : hour % 24;
}

type Style = 'short' | 'long' | 'day-only';

/**
 * Relative labels for upcoming nights, computed against the venue's IANA
 * timezone (device zone as fallback) so a Chicago listing flips days on
 * Chicago midnight, not the reader's. Tiers: Tonight or Today (same
 * night, with time), Tomorrow (next night, with time), "This Friday"
 * (two to six nights out), then absolute dates.
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
  const nights = dayDiff(dayKey(nightAnchor(now), timezone), dayKey(nightAnchor(date), timezone));
  const withTime = style !== 'day-only';
  const time = formatInZone(startsAt, timezone, { hour: 'numeric', minute: '2-digit' });
  if (nights === 0) {
    // A 2 PM Sunday poetry mic is not "Tonight"; evening and small-hours
    // shows are.
    const hour = hourInZone(date, timezone);
    const day = hour >= 17 || hour < NIGHT_ROLLOVER_HOURS ? 'Tonight' : 'Today';
    return withTime ? `${day} · ${time}` : day;
  }
  if (nights === 1) {
    return withTime ? `Tomorrow · ${time}` : 'Tomorrow';
  }
  if (nights >= 2 && nights <= 6) {
    // Named by the night it belongs to: a Sunday 12:30 AM show reads
    // "This Saturday", the night people will actually go out on.
    const weekday = formatInZone(nightAnchor(date).toISOString(), timezone, { weekday: 'long' });
    return `This ${weekday}`;
  }
  return formatInZone(
    startsAt,
    timezone,
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric' },
  );
}

/** Card, search row, and favorites form: "Tonight · 8:00 PM" or "Fri, Aug 7". */
export function formatNextDate(
  startsAt: string | null,
  timezone?: string | null,
  now: Date = new Date(),
): string {
  return relativeNextDate(startsAt, timezone, 'short', now);
}

/** Detail screen form: "Tonight · 8:00 PM" or "Friday, August 7". */
export function formatNextDateLong(
  startsAt: string | null,
  timezone?: string | null,
  now: Date = new Date(),
): string {
  return relativeNextDate(startsAt, timezone, 'long', now);
}

/** Tight columns (profile nights): "Tonight", "This Friday", or "Fri, Aug 7". */
export function formatRelativeDay(
  startsAt: string | null,
  timezone?: string | null,
  now: Date = new Date(),
): string {
  return relativeNextDate(startsAt, timezone, 'day-only', now);
}
