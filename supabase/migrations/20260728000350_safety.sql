-- Safety: blocks, reports, listing_flags.
-- Ordered before occurrences/signups because signup policies consult blocks.

create table blocks (
  blocker_id  uuid not null references profiles (id) on delete cascade,
  blocked_id  uuid not null references profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on blocks (blocked_id);

alter table blocks enable row level security;
create policy "blocks owner select" on blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "blocks owner insert" on blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "blocks owner delete" on blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- True when a block exists in either direction between the two users.
-- SECURITY DEFINER so it can be used inside policies on other tables
-- without granting read access to the blocks of others.
create or replace function private.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- Abuse reports (Guideline 1.2). Polymorphic target: enum + uuid, no FK,
-- so a report survives soft-deletion of its target.
create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles (id),
  target_type  report_target not null,
  target_id    uuid not null,
  reason       report_reason not null,
  details      text check (char_length(details) <= 1000),
  status       report_status not null default 'open',
  resolved_by  uuid references profiles (id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index reports_queue_idx on reports (status, created_at);

alter table reports enable row level security;
create policy "reports reporter insert" on reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy "reports reporter select own" on reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_admin());
create policy "reports admin update" on reports
  for update to authenticated using (private.is_admin());

-- Data-quality flags: "this info is wrong / this mic is dead."
create table listing_flags (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid not null references mic_series (id),
  flagger_id   uuid not null references profiles (id),
  reason       flag_reason not null,
  details      text check (char_length(details) <= 500),
  status       flag_status not null default 'open',
  resolved_by  uuid references profiles (id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index listing_flags_series_idx on listing_flags (series_id, status);

alter table listing_flags enable row level security;
create policy "flags authenticated insert" on listing_flags
  for insert to authenticated
  with check (flagger_id = (select auth.uid()) and status = 'open');
create policy "flags flagger select own" on listing_flags
  for select to authenticated
  using (flagger_id = (select auth.uid()) or private.is_admin());
create policy "flags series owner select" on listing_flags
  for select to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id and s.owner_id = (select auth.uid())
  ));
create policy "flags admin update" on listing_flags
  for update to authenticated using (private.is_admin());
