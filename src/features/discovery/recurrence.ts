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
};

export function formatLocalTime(startTime: string): string {
  const [hStr, mStr] = startTime.split(':');
  const hour = Number(hStr);
  const minute = Number(mStr ?? '0');
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
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
    const described: string[] = [];
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
      described.push(`${ordinal} ${day}`);
    }
    const capitalized = joinList(described).replace(/^./, (c) => c.toUpperCase());
    return `${capitalized} of the month, ${time}`;
  }

  return null;
}
