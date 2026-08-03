import type { DateBound } from '@/stores/filters';
import { isoWeekday } from '@/stores/filters';

/**
 * The Today and Weekend quick picks promise real dates. The server's day
 * filter matches weekdays across a 14 day window, so a "Today" result can
 * be dated next week. This narrows results to mics whose actual next night
 * lands inside the promised window.
 *
 * Known limit: a series whose next night is before the weekend (say Tuesday,
 * for a mic that runs Tuesday and Friday) drops out of Weekend even though a
 * Friday night exists, because the feed carries only the single next
 * occurrence per series. Fixing that fully needs an RPC change.
 */
export function boundByDate<T extends { next_starts_at: string | null }>(
  mics: T[],
  bound: DateBound,
  now: Date,
): T[] {
  if (!bound) {
    return mics;
  }
  const start = now.getTime();
  const end = bound === 'today' ? endOfLocalDay(now) : endOfUpcomingSunday(now);
  return mics.filter((mic) => {
    if (!mic.next_starts_at) {
      return false;
    }
    const t = new Date(mic.next_starts_at).getTime();
    if (t < start || t > end) {
      return false;
    }
    return bound === 'today' || isoWeekday(new Date(mic.next_starts_at)) >= 5;
  });
}

function endOfLocalDay(now: Date): number {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

function endOfUpcomingSunday(now: Date): number {
  const daysUntilSunday = (7 - isoWeekday(now)) % 7;
  const end = new Date(now);
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}
