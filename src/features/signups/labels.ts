import type { Database } from '@/types/database.types';

type SignupStatus = Database['public']['Enums']['signup_status'];

/**
 * Plain-language names for signup statuses, shared by the performer's
 * signup card and the producer's roster so the wording never drifts.
 * The performer-voice map (STATUS_LABELS in signup-card) says "You are
 * in"; a host reading the list needs the third person.
 */
export const ROSTER_STATUS_LABELS: Record<SignupStatus, string> = {
  requested: 'In the draw',
  confirmed: 'On the list',
  waitlisted: 'Waitlisted',
  drawn: 'Drawn: on the list',
  performed: 'Performed',
  no_show: 'Marked no-show',
};

export const STATUS_LABELS = ROSTER_STATUS_LABELS;

/** The sticky footer's action labels, shared so wording never drifts. */
export const CTA_LABELS = {
  signIn: 'Sign in to get on the list',
  join: 'Sign me up',
  lottery: 'Put my name in the draw',
  waitlist: 'Join the waitlist',
} as const;

/** Window states the footer shows as status rather than action. */
export function signupsOpenLabel(opensLabel: string): string {
  return `Signups open ${opensLabel}`;
}

export const SIGNUPS_CLOSED_LABEL = 'Signups are closed. Walk-ups may be possible at the venue.';

export function spotsTakenLabel(taken: number, capacity: number | null): string {
  if (capacity == null) {
    return taken === 1 ? '1 signed up so far' : `${taken} signed up so far`;
  }
  return taken >= capacity
    ? `Full · ${taken} of ${capacity} spots taken`
    : `${taken} of ${capacity} spots taken`;
}
