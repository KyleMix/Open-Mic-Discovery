import type { Database } from '@/types/database.types';

type SignupStatus = Database['public']['Enums']['signup_status'];

/**
 * The one name each signup status has, everywhere: the signup card, the
 * sticky footer, the Going tab, profile history, the producer's roster,
 * and the Live screen all read from this map. "Did I actually get in"
 * support messages start the moment two screens describe the same state
 * differently, so no surface carries its own variant.
 */
export const STATUS_LABELS: Record<SignupStatus, string> = {
  requested: 'In the draw',
  confirmed: 'On the list',
  waitlisted: 'Waitlisted',
  drawn: 'Drawn: on the list',
  performed: 'Performed',
  no_show: 'Marked no-show',
};

export const ROSTER_STATUS_LABELS = STATUS_LABELS;

/** The one way a slot number is written. */
export function slotLabel(slot: number): string {
  return `Slot ${slot}`;
}

/** A status with its slot when one is held: "On the list · Slot 4". */
export function statusWithSlot(status: SignupStatus, slot: number | null): string {
  return slot != null ? `${STATUS_LABELS[status]} · ${slotLabel(slot)}` : STATUS_LABELS[status];
}

/** "1st", "2nd", "3rd", "11th": place-in-line wording for the waitlist. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) {
    return `${n}th`;
  }
  const suffix = n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** The sticky footer's action labels, shared so wording never drifts. */
export const CTA_LABELS = {
  signIn: 'Sign in to get on the list',
  join: 'Sign me up',
  lottery: 'Put my name in the draw',
  waitlist: 'Join the waitlist',
  enablePerformer: 'Turn on performing',
} as const;

/** Why the footer shows "Turn on performing" instead of the signup action. */
export const ENABLE_PERFORMING_DETAIL = 'Signing up needs the performer role. One tap turns it on.';

/** Window states the footer shows as status rather than action. */
export function signupsOpenLabel(opensLabel: string): string {
  return `Signups open ${opensLabel}`;
}

export const SIGNUPS_CLOSED_LABEL =
  'Signups are closed. Walk-ups may still be possible at the venue.';

export function spotsTakenLabel(taken: number, capacity: number | null): string {
  if (capacity == null) {
    return taken === 1 ? '1 signed up so far' : `${taken} signed up so far`;
  }
  return taken >= capacity
    ? `Full · ${taken} of ${capacity} spots taken`
    : `${taken} of ${capacity} spots taken`;
}
