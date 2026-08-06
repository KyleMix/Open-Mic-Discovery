/**
 * Realtime channel topics.
 *
 * supabase-js keys channels by topic and hands back the *existing* channel
 * when a topic repeats. Adding a postgres_changes callback to a channel that
 * has already subscribed throws, and removeChannel is async, so the old
 * channel is still joined for a moment after cleanup runs. A remount inside
 * that window (React strict mode double-invoking effects, Fast Refresh, or
 * leaving a screen and coming straight back) would otherwise hand the same
 * joined channel to the new subscription and throw during the effect, which
 * crashes the tree rather than degrading.
 *
 * Giving every subscription its own topic sidesteps the whole problem, and
 * lets two screens watch the same row set at once.
 */
let sequence = 0;

export function uniqueChannelTopic(prefix: string, key: string): string {
  sequence += 1;
  return `${prefix}-${key}-${sequence}`;
}
