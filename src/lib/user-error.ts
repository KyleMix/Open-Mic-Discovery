import * as Sentry from '@sentry/react-native';

/**
 * Turns a raw Supabase/Postgres error into an Error whose message a person
 * can act on. The raw error goes to Sentry; the screen only ever sees plain
 * language: a known code's message, or the caller's action-specific
 * fallback. Never the raw error.message.
 */
type ErrorLike = {
  code?: string | null;
  message?: unknown;
};

const CODE_MESSAGES: Record<string, string> = {
  // RLS or grant refusal: the action is not allowed for this account state.
  '42501': 'Your account is not allowed to do that. Sign in with the right account and try again.',
  // Unique violation: the thing is already there.
  '23505': 'That already exists, so nothing was added.',
  // Foreign key violation: the target row is gone.
  '23503': 'Part of this was removed in the meantime. Refresh and try again.',
  // Check constraint: a value the database refuses.
  '23514': 'One of the values is not allowed. Check what you entered and try again.',
  // PostgREST: no rows where one was required.
  PGRST116: 'That could not be found. It may have been removed.',
};

const NETWORK_HINTS = ['failed to fetch', 'network request failed', 'fetch failed', 'networkerror'];

export const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.';

/**
 * Which Errors came out of userError, and so carry a message that has
 * already been through translation. A WeakSet rather than a property on the
 * error: nothing is added to an object a caller may inspect or serialize,
 * and an error built anywhere else cannot forge membership.
 */
const translated = new WeakSet<Error>();

export function userError(error: ErrorLike, fallback: string): Error {
  try {
    Sentry.captureException(error);
  } catch {
    // Reporting must never break the user-facing path.
  }
  const raw = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const code = typeof error.code === 'string' ? error.code : '';
  const message = NETWORK_HINTS.some((hint) => raw.includes(hint))
    ? NETWORK_MESSAGE
    : (CODE_MESSAGES[code] ?? fallback);
  const built = new Error(message);
  translated.add(built);
  return built;
}

/**
 * What to show for a failed query.
 *
 * A screen that hardcodes one sentence for its error state states a cause it
 * has not established. Discovery said "Check your connection" for every
 * failure, including a server that answered perfectly promptly with a 404,
 * which sends the reader looking at their wifi. This returns the translated
 * message when there is one, so the connection advice appears only for an
 * actual connection failure, and the caller's fallback otherwise.
 *
 * Anything that did not come from userError falls back, which keeps the
 * guarantee that a raw Postgres string is never rendered.
 */
export function userMessage(error: unknown, fallback: string): string {
  return error instanceof Error && translated.has(error) ? error.message : fallback;
}
