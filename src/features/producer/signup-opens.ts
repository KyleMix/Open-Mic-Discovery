import type { Database } from '@/types/database.types';

type SignupMethod = Database['public']['Enums']['signup_method'];

export type SignupOpensChoice = { minutes: number; label: string };

const HOUR = 60;
const DAY = 24 * HOUR;

/**
 * A walk-in list is signed at the venue on the night, so lead times measured
 * in days are meaningless for it: the sheet goes out shortly before the show.
 * Every other method books ahead, where days are what a producer thinks in.
 *
 * Both sets are stored in the same `signup_opens` interval column, which
 * already accepts sub-day values, so this is a presentation split only.
 */
export const WALK_IN_SIGNUP_OPENS_CHOICES: SignupOpensChoice[] = [
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: HOUR, label: '1 hour before' },
  { minutes: 90, label: '90 minutes before' },
  { minutes: 2 * HOUR, label: '2 hours before' },
  { minutes: 3 * HOUR, label: '3 hours before' },
];

export const BOOK_AHEAD_SIGNUP_OPENS_CHOICES: SignupOpensChoice[] = [
  { minutes: DAY, label: 'The day before' },
  { minutes: 3 * DAY, label: '3 days before' },
  { minutes: 7 * DAY, label: '1 week before' },
  { minutes: 14 * DAY, label: '2 weeks before' },
  { minutes: 30 * DAY, label: '30 days before' },
];

export const DEFAULT_WALK_IN_SIGNUP_OPENS_MINUTES = HOUR;
export const DEFAULT_BOOK_AHEAD_SIGNUP_OPENS_MINUTES = 7 * DAY;

/** Walk-in list: performers add their name at the venue. */
export function isWalkIn(method: SignupMethod): boolean {
  return method === 'first_come';
}

export function signupOpensChoices(method: SignupMethod): SignupOpensChoice[] {
  return isWalkIn(method) ? WALK_IN_SIGNUP_OPENS_CHOICES : BOOK_AHEAD_SIGNUP_OPENS_CHOICES;
}

export function defaultSignupOpensMinutes(method: SignupMethod): number {
  return isWalkIn(method)
    ? DEFAULT_WALK_IN_SIGNUP_OPENS_MINUTES
    : DEFAULT_BOOK_AHEAD_SIGNUP_OPENS_MINUTES;
}

/**
 * Keep the chosen lead time if the method still offers it, otherwise fall back
 * to that method's default. The two sets do not overlap, so switching between
 * a walk-in list and anything else always resets: "1 week before" must never
 * survive onto a walk-in list, where it would silently open signups a week out.
 */
export function coerceSignupOpensMinutes(minutes: number, method: SignupMethod): number {
  const choices = signupOpensChoices(method);
  return choices.some((choice) => choice.minutes === minutes)
    ? minutes
    : defaultSignupOpensMinutes(method);
}

/**
 * Postgres interval literal.
 *
 * Whole days stay days on purpose. Postgres treats `interval '7 days'` and
 * `interval '10080 minutes'` differently against a timestamptz: day arithmetic
 * follows the local clock across a daylight saving change, minute arithmetic
 * does not. Writing every value in minutes would shift signup openings by an
 * hour twice a year for every mic that books ahead, and would silently change
 * behavior for listings created before walk-in lists moved to minutes.
 */
export function signupOpensInterval(minutes: number): string {
  return minutes % DAY === 0 ? `${minutes / DAY} days` : `${minutes} minutes`;
}

/** The chosen label, for prose that has to name the lead time. */
export function signupOpensLabel(minutes: number, method: SignupMethod): string {
  const choices = signupOpensChoices(method);
  const match = choices.find((choice) => choice.minutes === minutes) ?? choices[0];
  // Every method has a non-empty choice list; the literal fallback only
  // exists so the label stays truthful if one is ever emptied.
  return match ? match.label : `${minutes} minutes before`;
}

/**
 * Reads total minutes out of a Postgres interval. Postgres renders the day and
 * time parts separately ("7 days", "01:30:00", "1 day 02:00:00"), so both are
 * parsed and added. The written-but-not-yet-round-tripped literals this module
 * produces ("90 minutes") are understood too, so a value is readable before
 * Postgres has normalized it. Falls back to the method's default when nothing
 * parses.
 */
export function parseSignupOpensMinutes(
  interval: string | null | undefined,
  method: SignupMethod,
): number {
  const fallback = defaultSignupOpensMinutes(method);
  if (!interval) {
    return fallback;
  }
  const days = interval.match(/(\d+)\s*days?/);
  const hours = interval.match(/(\d+)\s*hours?/);
  const minutes = interval.match(/(\d+)\s*min(?:ute)?s?/);
  const clock = interval.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!days && !hours && !minutes && !clock) {
    return fallback;
  }
  const total =
    (days ? Number(days[1]) * DAY : 0) +
    (hours ? Number(hours[1]) * HOUR : 0) +
    (minutes ? Number(minutes[1]) : 0) +
    (clock ? Number(clock[1]) * HOUR + Number(clock[2]) : 0);
  return Number.isFinite(total) && total > 0 ? total : fallback;
}
