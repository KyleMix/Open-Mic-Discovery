/**
 * Client-side mirror of private.rrule_matches (20260728000400), used to
 * mark nights that no longer fit their series' schedule.
 *
 * When a host changes the recurrence, nights carrying an override or a
 * signup deliberately survive on the old weekday. The database is the
 * authority on generation; this mirror only answers "does this kept night
 * still match the current rule", so the manage screen can say so instead
 * of presenting an off-pattern Tuesday as if it were part of the new
 * Wednesday schedule.
 */

const ISO_DOW_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

function parseParts(rrule: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const item of rrule.split(';')) {
    const [key, value] = item.split('=');
    if (key && value !== undefined) {
      parts[key.trim().toUpperCase()] = value.trim();
    }
  }
  return parts;
}

/** Days since the Unix epoch for a calendar date, timezone-free. */
function epochDays(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
}

/** ISO weekday 1 (Monday) .. 7 (Sunday). The epoch was a Thursday (4). */
function isoDow(days: number): number {
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

/** The Monday of the week containing the given day, in epoch days. */
function mondayOf(days: number): number {
  return days - (isoDow(days) - 1);
}

export function rruleMatches(rrule: string, anchorDate: string, localDate: string): boolean {
  const parts = parseParts(rrule);
  const freq = (parts.FREQ ?? '').toUpperCase();
  const interval = Number(parts.INTERVAL ?? '1') || 1;
  const byday = (parts.BYDAY ?? '').toUpperCase().split(',');
  const day = epochDays(localDate);
  const dow: string = ISO_DOW_CODES[isoDow(day) - 1] ?? '';

  if (freq === 'WEEKLY') {
    if (!byday.includes(dow)) {
      return false;
    }
    const weeks = (mondayOf(day) - mondayOf(epochDays(anchorDate))) / 7;
    return weeks % interval === 0;
  }
  if (freq === 'MONTHLY') {
    const date = new Date(`${localDate}T00:00:00Z`);
    const dom = date.getUTCDate();
    for (const entry of byday) {
      const m = entry.match(/^(-?\d+)([A-Z]{2})$/);
      if (!m || m[2] !== dow) {
        continue;
      }
      const ord = Number(m[1]);
      if (ord > 0) {
        if (Math.floor((dom - 1) / 7) + 1 === ord) {
          return true;
        }
      } else {
        const lastDom = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
        ).getUTCDate();
        if (Math.floor((lastDom - dom) / 7) + 1 === -ord) {
          return true;
        }
      }
    }
    return false;
  }
  return false;
}
