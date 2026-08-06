/**
 * Handles are derived from the stage name rather than asked for.
 *
 * A handle is a database requirement (unique, `^[a-z0-9_]{3,30}$`) but not a
 * decision anyone signing up wants to make, and there is no follower graph for
 * it to matter to. Deriving it removes a field from the first screen; Edit
 * profile can still change it later.
 */

const MAX = 30;
const MIN = 3;

/** Slug of a stage name, valid as a handle on its own if long enough. */
export function deriveHandleBase(stageName: string): string {
  const slug = stageName
    .normalize('NFKD')
    // Strip accents so "Renée" becomes "renee" rather than "ren_e".
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX);

  if (slug.length >= MIN) {
    return slug;
  }
  // A stage name of "JO" or "!!!" still has to produce a legal handle.
  return slug.length > 0 ? `${slug}_mic`.slice(0, MAX) : 'performer';
}

/**
 * The same base with a suffix, for when the plain one is taken. Trims the base
 * rather than the suffix so the result stays inside the 30-character limit.
 */
export function handleWithSuffix(base: string, suffix: string): string {
  const room = MAX - suffix.length - 1;
  const trimmed = base.slice(0, Math.max(room, 0)).replace(/_+$/, '');
  const candidate = `${trimmed}_${suffix}`;
  return candidate.length >= MIN ? candidate : `performer_${suffix}`.slice(0, MAX);
}

/** Short random suffix. Kept out of the pure helpers so they stay testable. */
export function randomHandleSuffix(): string {
  return Math.floor(Math.random() * 46656)
    .toString(36)
    .padStart(3, '0');
}
