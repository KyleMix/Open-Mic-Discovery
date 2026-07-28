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
