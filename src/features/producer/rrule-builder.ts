/**
 * Turns the recurrence builder's plain choices into the RRULE subset the
 * occurrence generator understands. The inverse of discovery/recurrence.ts:
 * producers never see an RRULE.
 */

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export type OrdinalChoice = '1' | '2' | '3' | '4' | '-1';

export type RecurrenceChoice =
  | { kind: 'weekly'; days: WeekdayCode[] }
  | { kind: 'biweekly'; days: WeekdayCode[] }
  | { kind: 'monthly'; ordinals: OrdinalChoice[]; day: WeekdayCode };

export function buildRrule(choice: RecurrenceChoice): string | null {
  if (choice.kind === 'weekly' || choice.kind === 'biweekly') {
    if (choice.days.length === 0) {
      return null;
    }
    const byday = [...choice.days]
      .sort((a, b) => WEEKDAY_CODES.indexOf(a) - WEEKDAY_CODES.indexOf(b))
      .join(',');
    return choice.kind === 'weekly'
      ? `FREQ=WEEKLY;BYDAY=${byday}`
      : `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byday}`;
  }
  if (choice.ordinals.length === 0) {
    return null;
  }
  const byday = [...choice.ordinals]
    .sort((a, b) => Number(a) - Number(b))
    .map((o) => `${o}${choice.day}`)
    .join(',');
  return `FREQ=MONTHLY;BYDAY=${byday}`;
}

/** Inverse of buildRrule, used to prefill the builder when editing a series. */
export function parseRrule(rrule: string): RecurrenceChoice | null {
  const parts = new Map<string, string>();
  for (const piece of rrule.split(';')) {
    const [key, value] = piece.split('=');
    if (key && value) {
      parts.set(key.toUpperCase(), value.toUpperCase());
    }
  }
  const byday = (parts.get('BYDAY') ?? '').split(',').filter(Boolean);
  if (parts.get('FREQ') === 'WEEKLY') {
    const days = byday.filter((d): d is WeekdayCode =>
      (WEEKDAY_CODES as readonly string[]).includes(d),
    );
    if (days.length !== byday.length || days.length === 0) {
      return null;
    }
    const interval = Number(parts.get('INTERVAL') ?? '1');
    if (interval === 1) {
      return { kind: 'weekly', days };
    }
    if (interval === 2) {
      return { kind: 'biweekly', days };
    }
    return null;
  }
  if (parts.get('FREQ') === 'MONTHLY') {
    const ordinals: OrdinalChoice[] = [];
    let day: WeekdayCode | null = null;
    for (const entry of byday) {
      const match = entry.match(/^(-?\d)([A-Z]{2})$/);
      const position = match?.[1];
      const code = match?.[2];
      if (!position || !code || !['1', '2', '3', '4', '-1'].includes(position)) {
        return null;
      }
      if (!(WEEKDAY_CODES as readonly string[]).includes(code)) {
        return null;
      }
      if (day && day !== code) {
        return null;
      }
      day = code as WeekdayCode;
      ordinals.push(position as OrdinalChoice);
    }
    if (!day || ordinals.length === 0) {
      return null;
    }
    return { kind: 'monthly', ordinals, day };
  }
  return null;
}

/**
 * The calendar date at a given place, not the UTC one.
 *
 * toISOString() converts to UTC first, so any evening west of Greenwich
 * reports tomorrow's date. For an anchor that is not a cosmetic difference:
 * a Sunday evening in Seattle becomes Monday, which is a different ISO week,
 * and the generator computes biweekly parity per ISO week.
 *
 * en-CA formats as YYYY-MM-DD, which is the shape the column wants. Same
 * approach as discovery/date-label.ts, including the fallback: an unknown
 * zone name on some runtime should degrade to the device date rather than
 * throw in the middle of saving a listing.
 */
function calendarDateIn(date: Date, timezone?: string | null): string {
  if (timezone) {
    try {
      return date.toLocaleDateString('en-CA', { timeZone: timezone });
    } catch {
      // Unknown zone on this runtime; device-local beats crashing.
    }
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The anchor date fixes biweekly parity: it must land on a matching weekday
 * in the week of the first real occurrence. For weekly/monthly rules any
 * recent date works; for biweekly the caller says whether the mic happens
 * this week or next.
 *
 * The date has to be the VENUE's, because that is the zone the generator
 * reads it in: private.generate_occurrences starts from
 * `(now() at time zone series.timezone)::date` and computes parity in ISO
 * weeks from there.
 *
 * Two rounds of this bug, and they are different. The first was UTC: read in
 * UTC, a mic set up on a Sunday evening anywhere west of Greenwich anchored
 * to Monday, landing in the next ISO week and inverting every alternate week
 * of the schedule, for good and without saying so. The fix was to use the
 * device date. That was right for a producer listing a mic in their own city
 * and still wrong across zones: a producer in Los Angeles listing a New York
 * mic late on a Sunday anchors to Sunday while the venue is already in
 * Monday, which is once again the next ISO week. Passing the venue zone
 * closes both, because the venue zone is the only one the server ever
 * consults.
 *
 * The zone is optional so the device date remains the fallback when the form
 * has not resolved one yet.
 */
export function computeAnchorDate(
  choice: RecurrenceChoice,
  today: Date,
  biweeklyStartsNextWeek = false,
  venueTimezone?: string | null,
): string {
  const anchor = new Date(today);
  if (choice.kind === 'biweekly' && biweeklyStartsNextWeek) {
    anchor.setDate(anchor.getDate() + 7);
  }
  return calendarDateIn(anchor, venueTimezone);
}
