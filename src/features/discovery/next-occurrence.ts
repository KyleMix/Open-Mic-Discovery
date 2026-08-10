/**
 * Which night the mic page is about.
 *
 * The occurrence query trails the clock (STARTED_GRACE_MS) so tonight's mic
 * stays on its own page while the show runs: at showtime the page used to
 * flip to next week, taking the performer's slot number and on-deck state
 * with it at exactly the moment they were standing in the room. The on-deck
 * push routes here, so this is also where that tap lands.
 *
 * Cancelled nights are skipped for the headline (they render separately as
 * exceptions), and a completed night is over: the host said so by ending the
 * show, so the page moves on to the next one.
 */

import type { Database } from '@/types/database.types';

type Occurrence = Database['public']['Tables']['mic_occurrences']['Row'];

/** Matches the Going tab's cutoff: a mic that started an hour ago is still
 * tonight's mic to the person standing outside it. */
export const STARTED_GRACE_MS = 4 * 60 * 60 * 1000;

export function nextOccurrence<T extends Pick<Occurrence, 'status'>>(
  occurrences: readonly T[],
): T | undefined {
  return occurrences.find((o) => o.status !== 'cancelled' && o.status !== 'completed');
}
