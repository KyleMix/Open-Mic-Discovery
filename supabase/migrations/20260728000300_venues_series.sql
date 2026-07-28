-- Venues, mic_series, claim_requests.

create table venues (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(name) between 1 and 120),
  address_line           text not null,
  neighborhood           text,
  city                   text not null,
  region                 text not null,
  country                text not null default 'US',
  location               geography(point, 4326) not null,
  age_restriction        age_restriction,      -- null = unknown; unknown is honest
  wheelchair_accessible  boolean,              -- tri-state: null = unknown
  has_pa                 boolean,
  has_stage              boolean,
  parking_notes          text check (char_length(parking_notes) <= 500),
  phone                  text,
  website                text,
  created_by             uuid references profiles (id),
  moderation_status      moderation_status not null default 'pending',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create index venues_location_gist on venues using gist (location);
create trigger venues_updated_at before update on venues
  for each row execute function private.set_updated_at();

-- Moderation status changes are admin/service only; user edits re-enter the
-- content filter queue.
create or replace function private.guard_moderated_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.moderation_status := 'pending';
    elsif new.moderation_status is distinct from old.moderation_status then
      new.moderation_status := old.moderation_status;
    end if;
  end if;
  return new;
end;
$$;

create trigger venues_guard before insert or update on venues
  for each row execute function private.guard_moderated_writes();

alter table venues enable row level security;
create policy "venues public select" on venues
  for select to anon, authenticated
  using (deleted_at is null and moderation_status = 'approved');
create policy "venues admin select" on venues
  for select to authenticated using (private.is_admin());
create policy "venues creator select own pending" on venues
  for select to authenticated using (created_by = (select auth.uid()));
create policy "venues authenticated insert" on venues
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "venues creator or admin update" on venues
  for update to authenticated
  using (created_by = (select auth.uid()) or private.is_admin());
-- No delete policy: venues soft-delete via deleted_at.

-- The recurring mic definition.
--
-- Recurrence model (deviation from the approved DDL, logged in
-- ARCHITECTURE.md): the RRULE string carries only the date pattern
-- (FREQ/INTERVAL/BYDAY). The local start time lives in start_time, doors in
-- doors_offset, and anchor_date fixes the phase of INTERVAL>1 rules
-- (biweekly parity). starts_at for an occurrence is computed as
-- (local_date + start_time) interpreted in `timezone`, which is DST-correct
-- by construction.
create table mic_series (
  id                 uuid primary key default gen_random_uuid(),
  venue_id           uuid not null references venues (id),
  created_by         uuid references profiles (id),
  owner_id           uuid references producer_profiles (profile_id),
  title              text not null check (char_length(title) between 1 and 120),
  disciplines        discipline[] not null check (cardinality(disciplines) > 0),
  description        text check (char_length(description) <= 2000),
  rrule              text not null,
  anchor_date        date not null,
  start_time         time not null,
  doors_offset       interval not null default interval '0',
  timezone           text not null,
  signup_method      signup_method not null,
  signup_opens       interval not null default interval '7 days',
  signup_closes      interval not null default interval '0',
  set_length_minutes smallint check (set_length_minutes > 0),
  cost_cents         integer not null default 0 check (cost_cents >= 0),
  cost_note          text check (char_length(cost_note) <= 300),
  capacity           smallint check (capacity > 0),
  is_active          boolean not null default true,
  last_confirmed_at  timestamptz,
  last_confirmed_by  uuid references profiles (id),
  moderation_status  moderation_status not null default 'pending',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index mic_series_venue_idx on mic_series (venue_id);
create index mic_series_owner_idx on mic_series (owner_id);
create index mic_series_disciplines_gin on mic_series using gin (disciplines);
create trigger mic_series_updated_at before update on mic_series
  for each row execute function private.set_updated_at();
create trigger mic_series_guard before insert or update on mic_series
  for each row execute function private.guard_moderated_writes();

-- Reject non-IANA timezone names at the database boundary.
create or replace function private.validate_series_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'invalid IANA timezone: %', new.timezone;
  end if;
  return new;
end;
$$;
create trigger mic_series_timezone_check before insert or update of timezone on mic_series
  for each row execute function private.validate_series_timezone();

alter table mic_series enable row level security;
create policy "series public select" on mic_series
  for select to anon, authenticated
  using (deleted_at is null and moderation_status = 'approved');
create policy "series admin select" on mic_series
  for select to authenticated using (private.is_admin());
create policy "series stakeholder select" on mic_series
  for select to authenticated
  using (created_by = (select auth.uid()) or owner_id = (select auth.uid()));
create policy "series authenticated insert" on mic_series
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (owner_id is null or owner_id = (select auth.uid()))
  );
create policy "series owner update" on mic_series
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (owner_id is null and created_by = (select auth.uid()))
    or private.is_admin()
  )
  with check (
    -- Ownership transfers happen through the claim workflow, not raw update.
    owner_id is null
    or owner_id = (select auth.uid())
    or private.is_admin()
  );
-- No delete policy: listings soft-delete only.

-- Claim workflow: admin-reviewed in v1.
create table claim_requests (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references mic_series (id),
  requester_id  uuid not null references profiles (id),
  evidence      text check (char_length(evidence) <= 1000),
  status        claim_status not null default 'pending',
  reviewed_by   uuid references profiles (id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index claim_requests_one_pending
  on claim_requests (series_id, requester_id) where status = 'pending';

alter table claim_requests enable row level security;
create policy "claims requester select" on claim_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or private.is_admin());
create policy "claims requester insert" on claim_requests
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from mic_series s
      where s.id = series_id and s.owner_id is null and s.deleted_at is null
    )
  );
create policy "claims admin update" on claim_requests
  for update to authenticated using (private.is_admin());
