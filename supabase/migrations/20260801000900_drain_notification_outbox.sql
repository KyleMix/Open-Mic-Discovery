-- Actually send the notifications.
--
-- Ten migrations write to notification_outbox, and the push-sender Edge
-- Function exists to drain it, but nothing has ever called that function. No
-- webhook, no scheduled job, no client invoke. Every row queued since the
-- outbox was built is still sitting there unsent, which means day-of favorite
-- reminders, new mic alerts, the weekly digest and on-deck notices have all
-- been quietly doing nothing. ARCHITECTURE.md describes this as wired; only
-- the enqueue half ever was.
--
-- The missing half is one scheduled HTTP call.
--
-- Credentials come from Vault rather than being written into the schema. The
-- call needs the service role key, which bypasses row level security
-- entirely, so it must not sit in a migration in a public repository nor in a
-- table any role can read. Vault stores it encrypted and only a definer
-- function reads it back.
--
-- Set both secrets once per environment, in the SQL editor:
--
--   select vault.create_secret(
--     'https://<ref>.supabase.co/functions/v1/push-sender', 'push_sender_url');
--   select vault.create_secret('<service-role-key>', 'push_sender_key');
--
-- Until they exist the job raises rather than failing quietly, so a silent
-- outbox cannot happen a second time.

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net unavailable here; the outbox drain cannot be scheduled';
end $$;

create or replace function private.drain_notification_outbox()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_sender_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'push_sender_key';

  -- Loud, not quiet. A misconfigured drain that returned silently would look
  -- exactly like the bug this migration exists to fix.
  if v_url is null or v_key is null then
    raise exception
      'push_sender_url and push_sender_key must exist in Vault before the outbox can drain';
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function private.drain_notification_outbox() from public, anon, authenticated;

-- Every minute. The function drains a bounded batch per call, so the interval
-- sets how fast the queue clears, and a minute is the shortest pg_cron
-- allows. On-deck notices are the reason it is not longer: being told you are
-- next is worthless if it arrives after you have been called up.
do $$
begin
  perform cron.schedule(
    'drain-notification-outbox',
    '* * * * *',
    'select private.drain_notification_outbox()'
  );
exception when others then
  raise notice 'pg_cron unavailable; call private.drain_notification_outbox() externally';
end $$;
