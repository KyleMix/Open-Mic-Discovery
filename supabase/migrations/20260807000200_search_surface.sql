-- Search surface: one indexed document per series.
--
-- Phase 0 of the search rebuild (docs/SEARCH_PHASE0.md) measured why
-- search_mics cannot scale: its
-- three-way ILIKE OR spans the mic_series/venues join, so the planner seq
-- scans both tables on every keystroke and the trigram indexes from
-- 20260801000800 never serve it. It also searches only title, venue name,
-- and city: neighborhood, address, description, and the host's public name
-- are invisible to search.
--
-- This migration builds the surface the new search RPC will query: a
-- series_search table holding, per series, a weighted tsvector (document)
-- and an unaccented plain string (fuzzy) for trigram similarity. Weights
-- follow what a searcher most likely typed:
--   A  mic title, venue name        (the name of the thing itself)
--   B  city, neighborhood, host     (where it is, who runs it)
--   C  street address, region       (rarely typed, still resolvable)
--   D  description                  (broadest, lowest signal)
-- The host name indexed is stage_name, the public identity. display_name
-- is private (20260730000300) and must never be searchable.
--
-- unaccent folds "Café" to "Cafe" in both the document and, via the same
-- wrapper, the query text, so accented venue names match unaccented input
-- and vice versa. The wrapper is marked immutable so it can feed generated
-- content and indexes; that is the standard trade with unaccent (the
-- dictionary file effectively never changes at runtime).
--
-- Maintenance is trigger-driven from the three source tables. A separate
-- table rather than columns on mic_series, because a venue rename fanning
-- out through an UPDATE of mic_series rows would fire guard_moderated_writes
-- and knock every series at that venue back to pending moderation.
--
-- Down migration: supabase/migrations/down/20260807000200_search_surface.down.sql

create extension if not exists unaccent;

-- Immutable unaccent for use in stored documents. unaccent() is only
-- stable because the dictionary could in principle change; treating it as
-- immutable is safe here and is what lets the GIN indexes exist.
create or replace function private.unaccent_imm(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.unaccent('public.unaccent'::regdictionary, coalesce(p_text, ''));
$$;

create table series_search (
  series_id  uuid primary key references mic_series (id) on delete cascade,
  document   tsvector not null,
  fuzzy      text not null,
  updated_at timestamptz not null default now()
);

create index series_search_document_gin on series_search using gin (document);
create index series_search_fuzzy_trgm on series_search using gin (fuzzy gin_trgm_ops);

alter table series_search enable row level security;
-- Presence is the access control: the sync functions below only ever
-- store documents for publicly visible listings (series and venue both
-- approved and not deleted) and delete the row the moment that stops
-- being true, so the select policy can be unconditional. This is not a
-- shortcut: tsquery and trigram operators are not leakproof, so any
-- row-condition policy here forbids them as index conditions and every
-- search becomes a sequential scan (measured: a zero-hit query went from
-- under 1ms to 180ms at 5,020 documents). Same access-by-construction
-- pattern as the occurrence_attendance view.
create policy "series search public select" on series_search
  for select to anon, authenticated
  using (true);
-- No insert/update/delete policies: writes happen only through the
-- SECURITY DEFINER sync functions below.

-- ---------------------------------------------------------------------------
-- Document builder. One function, called by every trigger and the backfill,
-- so the definition of "what is searchable" lives in exactly one place.
-- ---------------------------------------------------------------------------
create or replace function private.build_series_search(p_series_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Presence tracks visibility (see the policy above): rebuild from
  -- scratch, and only a publicly visible listing gets a row back.
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
  left join public.profiles host
    on host.id = coalesce(s.owner_id, s.created_by)
   and host.deleted_at is null
  where s.id = p_series_id
    and s.deleted_at is null
    and s.moderation_status = 'approved'
    and v.deleted_at is null
    and v.moderation_status = 'approved';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sync triggers on the three source tables.
-- ---------------------------------------------------------------------------
create or replace function private.series_search_sync_series()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.build_series_search(new.id);
  return null;
end;
$$;
create trigger mic_series_search_sync
  after insert
  or update of title, description, venue_id, owner_id, created_by,
               deleted_at, moderation_status
  on mic_series
  for each row execute function private.series_search_sync_series();

create or replace function private.series_search_sync_venue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.build_series_search(s.id)
  from public.mic_series s
  where s.venue_id = new.id;
  return null;
end;
$$;
create trigger venues_search_sync
  after update of name, neighborhood, city, region, address_line,
                  deleted_at, moderation_status
  on venues
  for each row execute function private.series_search_sync_venue();

create or replace function private.series_search_sync_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.build_series_search(s.id)
  from public.mic_series s
  where coalesce(s.owner_id, s.created_by) = new.id;
  return null;
end;
$$;
create trigger profiles_search_sync
  after update of stage_name, deleted_at
  on profiles
  for each row execute function private.series_search_sync_host();

-- Backfill every existing series.
do $$
begin
  perform private.build_series_search(id) from public.mic_series;
end;
$$;
