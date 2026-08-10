/**
 * Date and time phrases shared by the share captions and the share card, so
 * the sentence and the image never disagree about when the mic is.
 *
 * Everything here speaks venue-local time. Dates come from the occurrence
 * timestamptz rendered in the series zone; clock times come from the series'
 * own wall-clock columns, which are local by definition.
 */

import { eventDate } from '@/features/discovery/local-time';
import { describeRecurrence, formatLocalTime } from '@/features/discovery/recurrence';
import { parseIntervalMs } from '@/features/signups/window';

/** "Wednesday, Aug 12", in the mic's zone. */
export function dayAndDate(iso: string, timezone: string | null): string {
  return eventDate(iso, timezone, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** "Aug 12", in the mic's zone. */
export function monthDay(iso: string, timezone: string | null): string {
  return eventDate(iso, timezone, { month: 'short', day: 'numeric' });
}

/**
 * "tonight", "tomorrow", "this Wednesday", or "Wednesday, Aug 12": how a
 * person would actually say the date. The cutover to the full form sits at
 * seven days out, where "this Wednesday" stops being unambiguous.
 */
export function relativeDayPhrase(iso: string, timezone: string | null, now: Date): string {
  const dayKey = (d: string | Date) =>
    eventDate(typeof d === 'string' ? d : d.toISOString(), timezone, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  const target = dayKey(iso);
  if (target === dayKey(now)) {
    return 'tonight';
  }
  if (target === dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000))) {
    return 'tomorrow';
  }
  const msAway = new Date(iso).getTime() - now.getTime();
  if (msAway < 7 * 24 * 60 * 60 * 1000) {
    return `this ${eventDate(iso, timezone, { weekday: 'long' })}`;
  }
  return dayAndDate(iso, timezone);
}

/**
 * The cadence without its clock time: "Every Wednesday", "First Friday of
 * the month". Null when the rule cannot be said confidently, so callers fall
 * back to the concrete next date alone. Never the raw RRULE.
 */
export function cadence(rrule: string, startTime: string): string | null {
  const described = describeRecurrence(rrule, startTime);
  if (!described) {
    return null;
  }
  return described.replace(`, ${formatLocalTime(startTime)}`, '');
}

/**
 * The wall-clock time signups close (or the draw happens), derived the same
 * way the signup window is: showtime minus the closing lead. Pure clock
 * arithmetic in the mic's own zone, so DST cannot shift it. Null when the
 * lead is zero ("open until showtime", not worth a clause) and when the
 * lead is a day or more, where a bare clock time would read as show day
 * and be a day wrong.
 */
export function closesClockTime(startTime: string, signupCloses: string | null): string | null {
  if (!signupCloses) {
    return null;
  }
  const leadMinutes = Math.round(parseIntervalMs(signupCloses) / 60000);
  if (leadMinutes <= 0 || leadMinutes >= 24 * 60) {
    return null;
  }
  const [hours, minutes] = startTime.split(':');
  const startMinutes = Number(hours) * 60 + Number(minutes ?? '0');
  const wrapped = (((startMinutes - leadMinutes) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

/** Show time as the series states it: "8:30 PM". */
export function showClockTime(startTime: string): string {
  return formatLocalTime(startTime);
}


/** Hard cap with an honest ellipsis; never mid-word when avoidable. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
