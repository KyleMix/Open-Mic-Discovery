/**
 * Renders the stored recurrence (RRULE date pattern + local start time) as
 * plain English: "Every Tuesday, 8:00 PM". Producers and performers think in
 * these words, never in RRULE.
 */

const DAY_NAMES: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

const ORDINALS: Record<string, string> = {
  '1': 'first',
  '2': 'second',
  '3': 'third',
  '4': 'fourth',
  '5': 'fifth',
  '-1': 'last',
  // The validator (20260807000700) accepts ordinals to -5; a rule it
  // accepts must never render as "Schedule varies".
  '-2': 'second to last',
  '-3': 'third to last',
  '-4': 'fourth to last',
  '-5': 'fifth to last',
};

export function formatLocalTime(startTime: string): string {
  const [hStr, mStr] = startTime.split(':');
  const hour = Number(hStr);
  const minute = Number(mStr ?? '0');
  // Through Intl like every other time on screen: hardcoded AM/PM next to
  // a 24-hour "· 20:00" chip read as two apps on a de-DE device.
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute));
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function parseRrule(rrule: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const piece of rrule.split(';')) {
    const [key, value] = piece.split('=');
    if (key && value) {
      parts.set(key.trim().toUpperCase(), value.trim().toUpperCase());
    }
  }
  return parts;
}

function joinList(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Supports the same subset the occurrence generator supports:
 * FREQ=WEEKLY (any INTERVAL, multiple BYDAY) and FREQ=MONTHLY with ordinal
 * BYDAY entries (1TU, 3TU, -1FR). Returns null for anything it cannot say
 * confidently, so callers can fall back to showing the next date alone.
 */
export function describeRecurrence(rrule: string, startTime: string): string | null {
  const parts = parseRrule(rrule);
  const freq = parts.get('FREQ');
  const byday = (parts.get('BYDAY') ?? '').split(',').filter(Boolean);
  const time = formatLocalTime(startTime);
  if (byday.length === 0) {
    return null;
  }

  if (freq === 'WEEKLY') {
    const interval = Number(parts.get('INTERVAL') ?? '1');
    const dayNames = byday.flatMap((d) => {
      const name = DAY_NAMES[d];
      return name ? [name] : [];
    });
    if (dayNames.length !== byday.length) {
      return null;
    }
    const days = joinList(dayNames);
    if (interval === 1) {
      return `Every ${days}, ${time}`;
    }
    if (interval === 2) {
      return `Every other ${days}, ${time}`;
    }
    return `Every ${interval} weeks on ${days}, ${time}`;
  }

  if (freq === 'MONTHLY') {
    const entries: { ordinal: string; day: string }[] = [];
    for (const entry of byday) {
      const match = entry.match(/^(-?\d)([A-Z]{2})$/);
      const position = match?.[1];
      const code = match?.[2];
      if (!position || !code) {
        return null;
      }
      const ordinal = ORDINALS[position];
      const day = DAY_NAMES[code];
      if (!ordinal || !day) {
        return null;
      }
      entries.push({ ordinal, day });
    }
    // "First and third Sunday", not "first Sunday and third Sunday": when
    // every entry shares a weekday, say the day once.
    const oneDay = entries.every((e) => e.day === entries[0]?.day) ? entries[0]?.day : null;
    const phrase =
      oneDay && entries.length > 1
        ? `${joinList(entries.map((e) => e.ordinal))} ${oneDay}`
        : joinList(entries.map((e) => `${e.ordinal} ${e.day}`));
    const capitalized = phrase.replace(/^./, (c) => c.toUpperCase());
    return `${capitalized} of the month, ${time}`;
  }

  return null;
}
