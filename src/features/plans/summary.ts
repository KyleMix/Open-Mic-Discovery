import { STATUS_LABELS } from '@/features/signups/labels';
import type { Database } from '@/types/database.types';

type SignupStatus = Database['public']['Enums']['signup_status'];

/**
 * Wording for "who is coming", on both sides of the mic.
 *
 * Pure so the phrasing can be tested directly. Both sides read from the same
 * counts, which is the point: a performer who taps "planning to attend" and a
 * producer reading a headcount should be looking at the same number described
 * the same way.
 */

export type GoingRow = {
  planning: boolean | null;
  signup_status: SignupStatus | null;
  slot_position: number | null;
  on_deck_at: string | null;
  occurrence_status: Database['public']['Enums']['occurrence_status'] | null;
};

/** One line saying where this person stands for a night they said yes to. */
export function goingStatusLabel(row: GoingRow): string {
  if (row.occurrence_status === 'cancelled') {
    return 'Cancelled';
  }
  // On deck outranks everything: it means "you are up next, right now".
  if (row.on_deck_at) {
    return 'You are on deck';
  }
  if (row.signup_status) {
    const label = STATUS_LABELS[row.signup_status];
    return row.slot_position != null ? `${label}, slot ${row.slot_position}` : label;
  }
  if (row.planning) {
    return 'Planning to attend';
  }
  // Neither flag set cannot happen: the view is built from one or the other.
  return 'Going';
}

export type AttendanceCounts = {
  plan_count: number | null;
  performer_plan_count: number | null;
  signup_count: number | null;
};

function people(n: number): string {
  return n === 1 ? '1 person' : `${n} people`;
}

/**
 * The producer's headcount for one night.
 *
 * A walk-in list is signed at the venue, so the app has no list to show and
 * the plan count is the only forward signal there is. Every other method has
 * a real list, so that leads and the plan count follows as context.
 */
export function attendanceSummary(counts: AttendanceCounts, isWalkIn: boolean): string {
  const plans = counts.plan_count ?? 0;
  const performers = counts.performer_plan_count ?? 0;
  const signups = counts.signup_count ?? 0;

  if (plans === 0 && signups === 0) {
    return isWalkIn
      ? 'Nobody has said they are coming yet.'
      : 'Nobody on the list yet, and nobody has said they are coming.';
  }

  const planPart =
    plans === 0
      ? null
      : performers === plans
        ? `${people(plans)} planning to attend, all performing`
        : performers === 0
          ? `${people(plans)} planning to attend, none of them performing`
          : `${people(plans)} planning to attend, ${performers} of them performing`;

  const listPart =
    signups === 0 ? null : signups === 1 ? '1 person on the list' : `${signups} people on the list`;

  const parts = isWalkIn ? [planPart, listPart] : [listPart, planPart];
  return `${parts.filter(Boolean).join('. ')}.`;
}
