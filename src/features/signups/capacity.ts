/**
 * How full a night is.
 *
 * The numbers come from occurrence_spots, which counts exactly what the
 * signup lifecycle trigger counts against capacity. Nothing here recomputes
 * that rule; this only decides how to say it.
 *
 * "Full" is deliberately not "closed". A full first-come night still takes
 * signups, they just land on the waitlist, and people do get bumped. Saying
 * "full" and refusing the tap would cost someone a spot that opened up.
 */

export type SpotsTone = 'plain' | 'urgent' | 'full';

export type SpotsLabel = {
  label: string;
  tone: SpotsTone;
};

/** Below this, the number itself is the argument for signing up now. */
const URGENT_AT = 3;

export function spotsLabel(spotsLeft: number | null | undefined): SpotsLabel | null {
  // No capacity set means the host has not capped the night. Inventing a
  // number would be worse than saying nothing.
  if (spotsLeft == null) {
    return null;
  }
  if (spotsLeft <= 0) {
    return { label: 'Full', tone: 'full' };
  }
  return {
    label: spotsLeft === 1 ? '1 spot left' : `${spotsLeft} spots left`,
    tone: spotsLeft <= URGENT_AT ? 'urgent' : 'plain',
  };
}

/** The longer form for the mic page, where there is room for the whole story. */
export function spotsDetail(
  spotsLeft: number | null | undefined,
  capacity: number | null | undefined,
  planningPerformers = 0,
): string | null {
  if (spotsLeft == null || capacity == null) {
    return null;
  }
  const base =
    spotsLeft <= 0
      ? `Full. All ${capacity} spots are taken, and new signups join the waitlist.`
      : `${spotsLeft} of ${capacity} spots left.`;
  if (planningPerformers <= 0) {
    return base;
  }
  // Performers who said they are coming but have not taken a slot. They hold
  // nothing, so this is pressure, not arithmetic.
  const who =
    planningPerformers === 1
      ? '1 more performer says they are coming'
      : `${planningPerformers} more performers say they are coming`;
  return `${base} ${who}.`;
}
