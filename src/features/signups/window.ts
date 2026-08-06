/**
 * Signup window logic, mirroring the database policy exactly:
 * open when starts_at - signup_opens <= now <= starts_at - signup_closes.
 */

export type WindowState =
  { state: 'not_yet'; opensAt: Date } | { state: 'open'; closesAt: Date } | { state: 'closed' };

/**
 * Parses a Postgres interval: "7 days", "02:00:00", "1 day 02:30:00".
 *
 * It also reads the written form this app produces before Postgres has
 * normalized it ("90 minutes", "3 hours"). Reading from the database that
 * never happens, because Postgres renders the clock form back. But this
 * function decides whether the Sign up button appears, and an unrecognized
 * interval here parses as zero, which reads as "signups open at showtime"
 * and hides the button for the entire window. Silently agreeing with
 * producer/signup-opens.ts, which writes the column, is cheaper than finding
 * out which of the two a future caller reaches for.
 */
export function parseIntervalMs(interval: string): number {
  let ms = 0;
  const days = interval.match(/(\d+)\s*days?/);
  if (days) {
    ms += Number(days[1]) * 24 * 60 * 60 * 1000;
  }
  // Only when there is no clock part, or "1 day 02:30:00" would count its
  // hours twice.
  const clock = interval.match(/(\d+):(\d{2}):(\d{2})/);
  if (clock) {
    ms += (Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])) * 1000;
  } else {
    const hours = interval.match(/(\d+)\s*hours?/);
    if (hours) {
      ms += Number(hours[1]) * 60 * 60 * 1000;
    }
    const minutes = interval.match(/(\d+)\s*min(?:ute)?s?/);
    if (minutes) {
      ms += Number(minutes[1]) * 60 * 1000;
    }
  }
  return ms;
}

export function signupWindow(
  startsAt: string,
  signupOpens: string,
  signupCloses: string,
  now: Date,
): WindowState {
  const start = new Date(startsAt).getTime();
  const opensAt = start - parseIntervalMs(signupOpens);
  const closesAt = start - parseIntervalMs(signupCloses);
  if (now.getTime() < opensAt) {
    return { state: 'not_yet', opensAt: new Date(opensAt) };
  }
  if (now.getTime() <= closesAt) {
    return { state: 'open', closesAt: new Date(closesAt) };
  }
  return { state: 'closed' };
}

/**
 * The clock time a list opens, derived from the mic's local start time and its
 * lead time. Used where a series is described in general rather than a single
 * night, so it has no date to work from and stays on the local clock.
 *
 * `dayBefore` is true when the lead time crosses back over midnight, which a
 * late-night mic can do: a 12:30 AM show with a 3 hour lead opens at 9:30 PM
 * the previous evening, and saying just "9:30 PM" would be a day wrong.
 */
export function signupOpensClockTime(
  startTime: string,
  signupOpens: string,
): { time: string; dayBefore: boolean } {
  const [hours, minutes] = startTime.split(':');
  const startMinutes = Number(hours) * 60 + Number(minutes ?? '0');
  const leadMinutes = Math.round(parseIntervalMs(signupOpens) / 60000);
  const raw = startMinutes - leadMinutes;
  const dayBefore = raw < 0;
  const wrapped = ((raw % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { time: `${hour12}:${String(minute).padStart(2, '0')} ${period}`, dayBefore };
}
