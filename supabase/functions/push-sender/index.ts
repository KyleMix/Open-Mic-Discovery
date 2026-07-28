// Push sender: drains the notification outbox through the Expo Push API.
// Scheduled (or invoked after enqueue) with the service role; never callable
// by end users. Deploy with: supabase functions deploy push-sender
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
    return Response.json({ sent: 0 });
  }

  const profileIds = [...new Set(pending.map((n) => n.profile_id))];
  const { data: tokens } = await supabase
    .from('device_push_tokens')
    .select('profile_id, expo_token')
    .in('profile_id', profileIds);
  const tokensByProfile = new Map<string, string[]>();
  for (const t of tokens ?? []) {
    tokensByProfile.set(t.profile_id, [...(tokensByProfile.get(t.profile_id) ?? []), t.expo_token]);
  }

  const messages = pending.flatMap((n) =>
    (tokensByProfile.get(n.profile_id) ?? []).map((to) => ({
      to,
      title: n.title,
      body: n.body,
      data: n.payload,
      sound: 'default',
    })),
  );

  if (messages.length > 0) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  }

  // Mark processed even when a profile has no registered device: the outbox
  // is a delivery queue, not an inbox.
  await supabase
    .from('notification_outbox')
    .update({ sent_at: new Date().toISOString() })
    .in(
      'id',
      pending.map((n) => n.id),
    );

  return Response.json({ sent: messages.length, processed: pending.length });
});
