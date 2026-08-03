-- Schedule the push sender. Nothing invoked the Edge Function before, so
-- queued notifications sat unsent. The invoker reads its target URL and
-- token from Supabase Vault at run time, so no secret lives in a migration:
--
--   select vault.create_secret('https://<ref>.functions.supabase.co/push-sender', 'push_sender_url');
--   select vault.create_secret('<service role key>', 'push_sender_token');
--
-- Without those secrets (or without pg_net), each run is a quiet no-op, so
-- local and CI databases are unaffected.

create or replace function private.invoke_push_sender()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_sender_url';
    select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'push_sender_token';
  exception when others then
    return; -- vault unavailable here
  end;
  if v_url is null or v_token is null then
    return;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_token,
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  exception when others then
    null; -- pg_net unavailable here
  end;
end;
$$;

do $$
begin
  perform cron.schedule('push-sender', '* * * * *',
    'select private.invoke_push_sender()');
exception when others then
  raise notice 'pg_cron unavailable; invoke push-sender externally';
end $$;
