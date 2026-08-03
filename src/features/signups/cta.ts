import type { Database } from '@/types/database.types';

type SignupMethod = Database['public']['Enums']['signup_method'];
type OccurrenceStatus = Database['public']['Enums']['occurrence_status'];

export type SignupCta =
  | { kind: 'sign-in'; label: string }
  | { kind: 'join'; label: string }
  | null;

type Input = {
  signedIn: boolean;
  /** null while the profile is still loading; no CTA until it settles. */
  isPerformer: boolean | null;
  /** true while the signup lookup is in flight; no CTA until it settles. */
  signupPending: boolean;
  hasSignup: boolean;
  windowState: 'not_yet' | 'open' | 'closed';
  signupMethod: SignupMethod;
  occurrenceStatus: OccurrenceStatus;
};

export const JOIN_LABELS: Record<'lottery' | 'default', string> = {
  lottery: 'Put my name in the draw',
  default: 'Sign me up',
};

/**
 * Whether the mic detail screen shows a thumb-reach footer CTA, and what
 * it says. The full SignupCard stays in the scroll for status and edge
 * states; the footer only ever carries the one primary action, so it
 * disappears once you are on the list or the window is not open.
 */
export function signupCta(input: Input): SignupCta {
  if (input.signupMethod === 'host_booked' || input.occurrenceStatus !== 'scheduled') {
    return null;
  }
  if (!input.signedIn) {
    return { kind: 'sign-in', label: 'Sign in to get on the list' };
  }
  if (input.signupPending || input.hasSignup) {
    return null;
  }
  if (input.isPerformer !== true) {
    return null;
  }
  if (input.windowState !== 'open') {
    return null;
  }
  return {
    kind: 'join',
    label: input.signupMethod === 'lottery' ? JOIN_LABELS.lottery : JOIN_LABELS.default,
  };
}
