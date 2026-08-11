/**
 * Dev-only timing around Supabase calls, so a slow-feeling screen can be
 * measured on device before and after a change instead of guessed at.
 *
 * In a release build `__DEV__` is false and `timed` returns the awaited work
 * with no wrapper, no timer, and no log, so it costs nothing in production.
 * The label is what shows in the Metro/console log, prefixed so these lines
 * are easy to filter: `[supabase 132ms] discover:feed`.
 *
 * Usage:
 *   const { data, error } = await timed('discover:feed', () =>
 *     supabase.rpc('search_discover', args).abortSignal(signal));
 */
export async function timed<T>(label: string, run: () => PromiseLike<T>): Promise<T> {
  if (!__DEV__) {
    return run();
  }
  // performance.now is present in the Hermes/React Native runtime; Date.now is
  // the fallback so a bare test environment still works.
  const clock: () => number =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? () => performance.now()
      : () => Date.now();
  const started = clock();
  try {
    return await run();
  } finally {
    const ms = Math.round(clock() - started);
    console.log(`[supabase ${ms}ms] ${label}`);
  }
}
