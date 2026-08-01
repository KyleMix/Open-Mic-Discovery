/**
 * The numbers a host needs at a glance while the night is running.
 *
 * These stay on screen in every state, including after the last name has gone
 * up. A finished list is not the end of the host's job: they still have to
 * know whether there is room to put someone else on, and how many people are
 * waiting for exactly that.
 */

import type { LiveRow } from './order';

export type LiveCounts = {
  /** Everyone in the running order, done or not. */
  onList: number;
  done: number;
  toGo: number;
  /** Waiting for a slot to open. These are the host's next move. */
  waitlist: number;
};

export function liveCounts(rows: LiveRow[], onList: number, done: number): LiveCounts {
  return {
    onList,
    done,
    toGo: onList - done,
    waitlist: rows.filter((r) => r.status === 'waitlisted').length,
  };
}

/**
 * Spots still open, in the host's terms.
 *
 * The count comes from occurrence_spots, which is the same rule the signup
 * lifecycle enforces, so this never disagrees with what the database will
 * actually accept. No capacity means the host never capped the night, and
 * inventing a number there would be worse than saying nothing.
 */
export function spotsOpen(
  spotsLeft: number | null | undefined,
  capacity: number | null | undefined,
): { value: string; caption: string; full: boolean } {
  if (spotsLeft == null || capacity == null) {
    return { value: 'Open', caption: 'no cap set', full: false };
  }
  if (spotsLeft <= 0) {
    return { value: 'Full', caption: `all ${capacity} taken`, full: true };
  }
  return { value: String(spotsLeft), caption: `of ${capacity} open`, full: false };
}
