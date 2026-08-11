-- Search must not surface a host who is not publicly visible.
--
-- The bug (pre-launch audit finding 4). series_search.fuzzy and .document
-- carry the host's stage_name, and series_search is world readable by design
-- (the select policy is `using (true)` so the GIN indexes stay usable, with
-- presence as the access control). But build_series_search (20260807000200)
-- indexed the host filtering only on `deleted_at is null`, never on the
-- host's own moderation_status and never on whether the host is banned. And
-- the two events that hide a host did not rebuild the affected series rows:
--   * profiles_search_sync fired only ON UPDATE OF stage_name, deleted_at, so
--     rejecting a host (moderation_status -> rejected) left their name in
--     search.
--   * a ban is recorded in user_sanctions, not on profiles, and pauses
--     listings via mic_series.is_active, a column no search trigger watches,
--     so a banned host's stage_name stayed in the table too.
-- Net: `select fuzzy from series_search` as anon returned the stage names of
-- pending, rejected, and banned hosts, the one identifier public_profiles
-- goes out of its way to suppress.
--
-- The fix, in three parts, keeps the series itself searchable throughout (the
-- title and venue still index): only the host's name contribution is gated.
--   1. build_series_search LEFT JOINs the host with the visibility test in the
--      join condition, so a hidden host yields a null stage_name (folded to an
--      empty tsvector and skipped by concat_ws) while the series row remains.
--   2. profiles_search_sync also fires ON UPDATE OF moderation_status.
--   3. a new trigger on user_sanctions rebuilds a host's series when a ban is
--      applied or lifted, which is the event is_banned actually keys on.
-- A final backfill scrubs any name already exposed for a hidden host.
--
-- Down migration: supabase/migrations/down/20260811000100_search_hides_hidden_hosts.down.sql

-- 1. Document builder: gate the host contribution on the host being visible.
create or replace function private.build_series_search(p_series_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Presence tracks visibility (see the policy in 20260807000200): rebuild
  -- from scratch, and only a publicly visible listing gets a row back.
  delete from public.series_search where series_id = p_series_id;
  insert into public.series_search (series_id, document, fuzzy, updated_at)
  select
    s.id,
    setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(s.title)), 'A')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.name)), 'A')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.city)), 'B')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.neighborhood)), 'B')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(host.stage_name)), 'B')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.address_line)), 'C')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.region)), 'C')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(s.description)), 'D'),
    private.unaccent_imm(
      concat_ws(' ', s.title, v.name, v.city, v.neighborhood, host.stage_name)
    ),
    now()
  from public.mic_series s
  join public.venues v on v.id = s.venue_id
  -- The host name rides along only when the host is publicly visible. A
  -- pending, rejected, or banned host contributes null here, so the series
  -- keeps its own title and venue text but never leaks the hidden name. The
  -- test lives in the join, not the WHERE, so hiding the host does not drop
  -- the series from search.
  left join public.profiles host
    on host.id = coalesce(s.owner_id, s.created_by)
   and host.deleted_at is null
   and host.moderation_status = 'approved'
   and not private.is_banned(host.id)
  where s.id = p_series_id
    and s.deleted_at is null
    and s.moderation_status = 'approved'
    and v.deleted_at is null
    and v.moderation_status = 'approved';
end;
$$;

-- 2. A host being rejected (or re-approved) now resyncs their series, the same
-- way a stage-name change or soft delete already did.
drop trigger profiles_search_sync on profiles;
create trigger profiles_search_sync
  after update of stage_name, deleted_at, moderation_status
  on profiles
  for each row execute function private.series_search_sync_host();

-- 3. A ban lives in user_sanctions and is what is_banned reads, so the rebuild
-- has to hang off that table too. Fires on the ban being written and on it
-- being lifted (lifted_at set), rebuilding every series the banned host runs.
create or replace function private.series_search_sync_sanction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only a ban changes is_banned; suspensions and warnings do not touch
  -- search visibility, so they need no rebuild.
  if new.type = 'banned' then
    perform private.build_series_search(s.id)
    from public.mic_series s
    where coalesce(s.owner_id, s.created_by) = new.user_id;
  end if;
  return null;
end;
$$;
create trigger user_sanctions_search_sync
  after insert or update of lifted_at
  on user_sanctions
  for each row execute function private.series_search_sync_sanction();

-- Backfill: scrub any name already indexed for a host who is not visible, and
-- restore any that a stricter build now correctly includes. Cheap: one call
-- per series, the same path every trigger uses.
do $$
begin
  perform private.build_series_search(id) from public.mic_series;
end;
$$;
