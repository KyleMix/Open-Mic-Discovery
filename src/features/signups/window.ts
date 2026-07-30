/**
 * Signup window logic, mirroring the database policy exactly:
 * open when starts_at - signup_opens <= now <= starts_at - signup_closes.
 */

export type WindowState =
  { state: 'not_yet'; opensAt: Date } | { state: 'open'; closesAt: Date } | { state: 'closed' };

/** Parses a Postgres interval string: "7 days", "02:00:00", "1 day 02:30:00". */
export function parseIntervalMs(interval: string): number {
  let ms = 0;
  const dayMatch = interval.match(/(\d+)\s+day/);
  if (dayMatch) {
    ms += Number(dayMatch[1]) * 24 * 60 * 60 * 1000;
  }
  const timeMatch = interval.match(/(\d+):(\d{2}):(\d{2})/);
  if (timeMatch) {
    ms += (Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3])) * 1000;
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
