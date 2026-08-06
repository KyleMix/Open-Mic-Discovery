// Push sender: drains the notification outbox through the Expo Push API.
// Scheduled (or invoked after enqueue) with the service role; never callable
// by end users. Deploy with: supabase functions deploy push-sender
//
// The rules live in ./messages.ts, which is free of Deno so it can be unit
// tested. This file is the plumbing: read, send, record.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  buildPushMessages,
  chunkMessages,
  deadTokensFromTickets,
  settledOutboxIds,
  type PushMessage,
} from './messages.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!authHeader.endsWith(serviceKey)) {
    return new Response('forbidden', { status: 403 });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

  const { data: pending, error } = await supabase
    .from('notification_outbox')
    .select('id, profile_id, title, body, payload')
    .is('sent_at', null)
    .order('created_at')
    .limit(BATCH);
  if (error) {
    return new Response(error.message, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return Response.json({ sent: 0, processed: 0 });
  }

  const profileIds = [...new Set(pending.map((n) => n.profile_id))];
  const { data: tokens } = await supabase
    .from('device_push_tokens')
    .select('profile_id, expo_token')
    .in('profile_id', profileIds);

  const messages = buildPushMessages(pending, tokens ?? []);

  // One request per 100 messages. A batch of 100 rows fans out to more than
  // 100 messages as soon as anyone has a second device, and Expo rejects an
  // over-sized request wholesale.
  const failed: PushMessage[] = [];
  const dead: string[] = [];
  for (const chunk of chunkMessages(messages)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map(({ outboxId: _outboxId, ...m }) => m)),
      });
      if (!response.ok) {
        failed.push(...chunk);
        continue;
      }
      dead.push(...deadTokensFromTickets(chunk, await response.json()));
    } catch {
      // Network failure: leave these rows in the queue for the next run
      // rather than marking them sent and losing them.
      failed.push(...chunk);
    }
  }

  // A token Expo reports as unregistered belongs to an app that was
  // uninstalled. Kept, it wastes a slot in every future capped request and
  // never arrives.
  if (dead.length > 0) {
    await supabase.from('device_push_tokens').delete().in('expo_token', dead);
  }

  const settled = settledOutboxIds(pending, failed);
  if (settled.length > 0) {
    await supabase
      .from('notification_outbox')
      .update({ sent_at: new Date().toISOString() })
      .in('id', settled);
  }

  return Response.json({
    sent: messages.length - failed.length,
    processed: settled.length,
    retrying: pending.length - settled.length,
    prunedTokens: dead.length,
  });
});
