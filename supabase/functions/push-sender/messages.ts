/**
 * Turning outbox rows into Expo push messages.
 *
 * Kept free of Deno and of the Supabase client so it can be unit tested: this
 * is the part with rules in it, and it delivers every notification the app
 * sends.
 */

export type OutboxRow = {
  id: string;
  profile_id: string;
  title: string;
  body: string;
  payload: unknown;
};

export type DeviceToken = { profile_id: string; expo_token: string };

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: unknown;
  sound: 'default';
  /** The outbox row this came from, so delivery can be tracked back to it. */
  outboxId: string;
};

/**
 * Expo rejects a request carrying more than this many messages. The outbox is
 * read in batches of rows, but a row fans out to one message per registered
 * device, so the message count is always the larger number and is the one
 * that has to be chunked.
 */
export const EXPO_MAX_MESSAGES_PER_REQUEST = 100;

export function buildPushMessages(rows: OutboxRow[], tokens: DeviceToken[]): PushMessage[] {
  const byProfile = new Map<string, string[]>();
  for (const token of tokens) {
    const existing = byProfile.get(token.profile_id);
    if (existing) {
      existing.push(token.expo_token);
    } else {
      byProfile.set(token.profile_id, [token.expo_token]);
    }
  }
  return rows.flatMap((row) =>
    (byProfile.get(row.profile_id) ?? []).map((to) => ({
      to,
      title: row.title,
      body: row.body,
      data: row.payload,
      sound: 'default' as const,
      outboxId: row.id,
    })),
  );
}

export function chunkMessages(
  messages: PushMessage[],
  size = EXPO_MAX_MESSAGES_PER_REQUEST,
): PushMessage[][] {
  if (size < 1) {
    throw new Error('chunk size must be at least 1');
  }
  const chunks: PushMessage[][] = [];
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size));
  }
  return chunks;
}

/**
 * Which outbox rows are finished with.
 *
 * A row is done when every message it produced was accepted, and when it
 * produced none at all: a person with no registered device is not owed a
 * delivery, and leaving their rows in the queue would mean re-reading them
 * forever. A row whose send failed stays put and is retried on the next run,
 * which risks a duplicate on a partial failure. That is the right way round:
 * a notification arriving twice is a nuisance, one never arriving is the
 * feature not working.
 */
export function settledOutboxIds(rows: OutboxRow[], failedMessages: PushMessage[]): string[] {
  const failed = new Set(failedMessages.map((m) => m.outboxId));
  return rows.map((r) => r.id).filter((id) => !failed.has(id));
}

/**
 * Tokens Expo says are dead, from a push response.
 *
 * Expo answers with one ticket per message, in order. A DeviceNotRegistered
 * ticket means the app was uninstalled or the token was rotated; keeping it
 * means every future send to that person wastes a slot in a capped request
 * and silently fails. They are the only error worth acting on automatically.
 */
export function deadTokensFromTickets(sent: PushMessage[], response: unknown): string[] {
  const tickets = (response as { data?: unknown })?.data;
  if (!Array.isArray(tickets)) {
    return [];
  }
  const dead: string[] = [];
  tickets.forEach((ticket, i) => {
    const details = (ticket as { details?: { error?: string } })?.details;
    if (details?.error === 'DeviceNotRegistered' && sent[i]) {
      dead.push(sent[i].to);
    }
  });
  return [...new Set(dead)];
}
