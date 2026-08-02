/**
 * Which credit applies to a given night.
 *
 * A series carries defaults (occurrence_id null) and any number of per-night
 * overrides. For one night the answer is: that night's row if it exists,
 * otherwise the series default, otherwise nobody. The same rule covers a mic
 * whose host never changes and a mic with a different guest every week, which
 * is why there is one table rather than two.
 */
import type { Database } from '@/types/database.types';

export type CreditRole = Database['public']['Enums']['credit_role'];
export type Credit = Database['public']['Views']['mic_credit_public']['Row'];

/**
 * The credit for one role on one night.
 *
 * Pass occurrenceId undefined to ask what the series does normally, which is
 * what a listing shows before a specific night is chosen.
 */
export function creditFor(
  credits: Credit[],
  role: CreditRole,
  occurrenceId?: string | null,
): Credit | null {
  const forRole = credits.filter((c) => c.role === role);
  if (occurrenceId) {
    const override = forRole.find((c) => c.occurrence_id === occurrenceId);
    if (override) {
      return override;
    }
  }
  return forRole.find((c) => c.occurrence_id === null) ?? null;
}

/** True when this night differs from what the series usually does. */
export function isOverridden(
  credits: Credit[],
  role: CreditRole,
  occurrenceId: string | null | undefined,
): boolean {
  if (!occurrenceId) {
    return false;
  }
  return credits.some((c) => c.role === role && c.occurrence_id === occurrenceId);
}

/** How a credit should be named, falling back through what is known. */
export function creditName(credit: Credit): string {
  const name = credit.name?.trim();
  if (name) {
    return name;
  }
  const handle = credit.handle?.trim();
  if (handle) {
    return `@${handle}`;
  }
  // The database refuses a credit with neither a profile nor a name, so this
  // is only reachable if a linked account stopped resolving (deleted, held for
  // moderation, or blocked) and nothing was ever typed alongside it.
  return 'To be announced';
}
