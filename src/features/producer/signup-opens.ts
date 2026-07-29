/** The choices producers can pick for how far ahead signups open. */
export const SIGNUP_OPENS_CHOICES: { days: number; label: string }[] = [
  { days: 1, label: 'The day before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: '1 week before' },
  { days: 14, label: '2 weeks before' },
  { days: 30, label: '30 days before' },
];

export const DEFAULT_SIGNUP_OPENS_DAYS = 7;

/**
 * Reads the day count out of a Postgres interval string like "7 days",
 * "1 day", or "7 days 00:00:00". Falls back to the default when the
 * interval is missing or has no day component.
 */
export function parseSignupOpensDays(interval: string | null | undefined): number {
  if (!interval) {
    return DEFAULT_SIGNUP_OPENS_DAYS;
  }
  const match = interval.match(/(\d+)\s*day/);
  if (!match) {
    return DEFAULT_SIGNUP_OPENS_DAYS;
  }
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_SIGNUP_OPENS_DAYS;
}
