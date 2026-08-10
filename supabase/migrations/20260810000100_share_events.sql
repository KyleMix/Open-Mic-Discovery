-- Share telemetry, first-party and write-only.
--
-- The share sheet needs to answer three questions the app currently cannot:
-- does anyone open it, which intent do they share as, and does the share
-- complete. No analytics SDK exists (the privacy policy promises none), so
-- the events land in a plain table through the same supabase-js client as
-- everything else. Write-only for API roles: nothing in the app reads these
-- rows back, and only admins can select them, so the table adds no new
-- surface for reading anyone's behavior.
--
-- channel is whatever the OS reports about the destination (iOS shares
-- report an activity type; Android reports nothing) and is nullable for
-- exactly that reason.

create table share_events (
  id             uuid primary key default gen_random_uuid(),
  -- Null for signed-out sharers: guests can browse and share a mic.
  profile_id     uuid references profiles (id) on delete set null,
  series_id      uuid not null references mic_series (id) on delete cascade,
  occurrence_id  uuid references mic_occurrences (id) on delete set null,
  intent         text not null check (intent in ('performer', 'producer', 'neutral')),
  action         text not null check (action in
                   ('sheet_open', 'intent_switch', 'share_completed',
                    'copy_caption', 'save_image', 'story_share')),
  channel        text check (char_length(channel) <= 120),
  created_at     timestamptz not null default now()
);
-- Reads are by mic and by time: "how often is this listing shared".
create index share_events_series_idx on share_events (series_id, created_at desc);

alter table share_events enable row level security;

-- Signed-in sharers write their own id or none; guests write none. Nobody
-- can attribute an event to somebody else.
create policy "share events insert" on share_events
  for insert to anon, authenticated
  with check (profile_id is null or profile_id = (select auth.uid()));

create policy "share events admin select" on share_events
  for select to authenticated using (private.is_admin());

-- No update or delete policies: telemetry is append-only for API roles.
-- The default privileges from 20260728001200 grant the table verbs, so state
-- explicitly that RLS default-deny is what stands; revoking the unused verbs
-- keeps a future policy mistake from arming them.
revoke update, delete, truncate on share_events from anon, authenticated;

-- Same abuse valve as reports and flags. Anonymous inserts pass through the
-- limiter (it keys on auth.uid()), which is accepted: the table is
-- append-only, size-bounded per row, and swept by retention below.
create trigger share_events_rate_limit before insert on share_events
  for each row execute function private.enforce_rate_limit('share_events', '120', '1 hour');

-- Retention: telemetry, not history. Scheduled the same way as the queue
-- functions in 20260728001100: pg_cron where available, external otherwise.
create or replace function private.prune_share_events()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.share_events where created_at < now() - interval '180 days';
$$;

do $$ begin
  perform cron.schedule('prune-share-events', '15 10 * * *',
    'select private.prune_share_events()');
exception when others then
  raise notice 'pg_cron unavailable; schedule private.prune_share_events() externally';
end $$;
