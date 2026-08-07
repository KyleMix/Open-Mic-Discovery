import { STATUS_LABELS } from '@/features/signups/components/signup-card';
import {
  CTA_LABELS,
  ENABLE_PERFORMING_DETAIL,
  SIGNUPS_CLOSED_LABEL,
  signupsOpenLabel,
  spotsTakenLabel,
} from '@/features/signups/labels';
import type { Database } from '@/types/database.types';

type SignupMethod = Database['public']['Enums']['signup_method'];
type SignupStatus = Database['public']['Enums']['signup_status'];
type OccurrenceStatus = Database['public']['Enums']['occurrence_status'];

export type SignupCta =
  | { kind: 'sign-in'; label: string }
  | { kind: 'join'; label: string; detail?: string }
  | { kind: 'status'; label: string; detail?: string }
  | { kind: 'enable-performer'; label: string; detail: string }
  | null;

type Input = {
  signedIn: boolean;
  /** null while the profile is still loading; no CTA until it settles. */
  isPerformer: boolean | null;
  /** true while the signup lookup is in flight; no CTA until it settles. */
  signupPending: boolean;
  /** The performer's own signup status for this night, if any. */
  myStatus: SignupStatus | null;
  mySlot: number | null;
  windowState: 'not_yet' | 'open' | 'closed';
  signupMethod: SignupMethod;
  occurrenceStatus: OccurrenceStatus;
  /** Preformatted relative label for when signups open, e.g. "This Friday". */
  opensLabel: string | null;
  /** Taken-versus-capacity, when known. */
  taken: number | null;
  capacity: number | null;
};

/**
 * What the mic detail screen's thumb-reach footer shows. Every state of a
 * signable night renders something: an action (sign in, sign up, join the
 * waitlist) or a status (your signup, when the list opens, closed). Only
 * non-signable nights (host booked, cancelled), missing roles, and
 * in-flight lookups render nothing.
 */
export function signupCta(input: Input): SignupCta {
  if (input.signupMethod === 'host_booked' || input.occurrenceStatus !== 'scheduled') {
    return null;
  }
  if (!input.signedIn) {
    return { kind: 'sign-in', label: CTA_LABELS.signIn };
  }
  if (input.signupPending) {
    return null;
  }
  if (input.myStatus) {
    return {
      kind: 'status',
      label:
        STATUS_LABELS[input.myStatus] + (input.mySlot != null ? ` · Slot ${input.mySlot}` : ''),
    };
  }
  // A missing role gets an action, not silence: the footer is the only
  // control in thumb reach, and rendering nothing there reads as a bug.
  if (input.isPerformer === false) {
    return {
      kind: 'enable-performer',
      label: CTA_LABELS.enablePerformer,
      detail: ENABLE_PERFORMING_DETAIL,
    };
  }
  if (input.isPerformer == null) {
    return null;
  }
  if (input.windowState === 'not_yet') {
    return { kind: 'status', label: signupsOpenLabel(input.opensLabel ?? 'soon') };
  }
  if (input.windowState === 'closed') {
    return { kind: 'status', label: SIGNUPS_CLOSED_LABEL };
  }
  const detail =
    input.taken != null && input.signupMethod !== 'lottery'
      ? spotsTakenLabel(input.taken, input.capacity)
      : undefined;
  const full = input.capacity != null && input.taken != null && input.taken >= input.capacity;
  if (full && input.signupMethod !== 'lottery') {
    return { kind: 'join', label: CTA_LABELS.waitlist, detail };
  }
  return {
    kind: 'join',
    label: input.signupMethod === 'lottery' ? CTA_LABELS.lottery : CTA_LABELS.join,
    detail,
  };
}
