-- Occurrences (materialized 90-day window), the generator, signups,
-- favorites, attendance_log.

create table mic_occurrences (
  id                   uuid primary key default gen_random_uuid(),
  series_id            uuid not null references mic_series (id),
  local_date           date not null,
  starts_at            timestamptz not null,
  doors_at             timestamptz,
  status               occurrence_status not null default 'scheduled',
  override_title       text check (char_length(override_title) <= 120),
  override_cost_cents  integer check (override_cost_cents >= 0),
  override_venue_id    uuid references venues (id),
  cancellation_note    text check (char_length(cancellation_note) <= 500),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (series_id, local_date)
);
create index mic_occurrences_starts_idx on mic_occurrences (starts_at);
create index mic_occurrences_series_idx on mic_occurrences (series_id, starts_at);
create trigger mic_occurrences_updated_at before update on mic_occurrences
  for each row execute function private.set_updated_at();

alter table mic_occurrences enable row level security;
create policy "occurrences public select" on mic_occurrences
  for select to anon, authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id
      and s.deleted_at is null
      and s.moderation_status = 'approved'
  ));
create policy "occurrences stakeholder select" on mic_occurrences
  for select to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id
      and (s.owner_id = (select auth.uid()) or s.created_by = (select auth.uid()))
  ) or private.is_admin());
create policy "occurrences owner update" on mic_occurrences
  for update to authenticated
  using (exists (
    select 1 from mic_series s
    where s.id = series_id
      and (s.owner_id = (select auth.uid())
           or (s.owner_id is null and s.created_by = (select auth.uid())))
  ) or private.is_admin());
-- Inserts happen only through the generator (definer) or service role:
-- no insert policy for API roles.

-- ---------------------------------------------------------------------------
-- Occurrence generator.
--
-- Supports the RRULE subset real open mics use:
--   FREQ=WEEKLY;INTERVAL=n;BYDAY=MO..SU        (weekly, biweekly, ...)
--   FREQ=MONTHLY;BYDAY=1TU,3TU / -1FR          (nth / last weekday of month)
-- Idempotent by construction: INSERT ... ON CONFLICT (series_id, local_date)
-- DO NOTHING never duplicates and never touches overrides or cancellations.
-- SECURITY DEFINER: called by the nightly job and by series triggers.
-- ---------------------------------------------------------------------------
create or replace function private.rrule_matches(p_rrule text, p_anchor date, p_day date)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts    jsonb := '{}'::jsonb;
  v_pair     text[];
  v_item     text;
  v_freq     text;
  v_interval int;
  v_byday    text[];
  v_dow      text;
  v_entry    text;
  v_ord      int;
  v_nth      int;
  v_last_dom date;
begin
  foreach v_item in array string_to_array(p_rrule, ';') loop
    v_pair := string_to_array(v_item, '=');
    if array_length(v_pair, 1) = 2 then
      v_parts := v_parts || jsonb_build_object(upper(trim(v_pair[1])), trim(v_pair[2]));
    end if;
  end loop;

  v_freq := upper(coalesce(v_parts->>'FREQ', ''));
  v_interval := coalesce((v_parts->>'INTERVAL')::int, 1);
  v_byday := string_to_array(upper(coalesce(v_parts->>'BYDAY', '')), ',');
  -- Two-letter weekday code of the candidate day (MO, TU, ...).
  v_dow := (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from p_day)::int];

  if v_freq = 'WEEKLY' then
    if not (v_dow = any (v_byday)) then
      return false;
    end if;
    -- Week parity relative to the anchor week (ISO weeks, Monday-based).
    return mod(
      (date_trunc('week', p_day::timestamp)::date
         - date_trunc('week', p_anchor::timestamp)::date) / 7,
      v_interval
    ) = 0;
  elsif v_freq = 'MONTHLY' then
    foreach v_entry in array v_byday loop
      if v_entry !~ '^-?[0-9]+[A-Z]{2}$' then
        continue;
      end if;
      v_ord := (regexp_replace(v_entry, '[A-Z]', '', 'g'))::int;
      if right(v_entry, 2) <> v_dow then
        continue;
      end if;
      if v_ord > 0 then
        v_nth := ((extract(day from p_day)::int - 1) / 7) + 1;
        if v_nth = v_ord then
          return true;
        end if;
      else
        -- Negative ordinal: count from month end (-1 = last).
        v_last_dom := (date_trunc('month', p_day) + interval '1 month' - interval '1 day')::date;
        v_nth := ((extract(day from v_last_dom)::int - extract(day from p_day)::int) / 7) + 1;
        if v_nth = -v_ord then
          return true;
        end if;
      end if;
    end loop;
    return false;
  end if;
  return false;
end;
$$;

create or replace function private.generate_occurrences(
  p_series_id uuid default null,
  p_horizon_days int default 90
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series   record;
  v_day      date;
  v_starts   timestamptz;
  v_inserted int := 0;
  v_count    int;
begin
  for v_series in
    select id, rrule, anchor_date, start_time, doors_offset, timezone
    from public.mic_series
    where is_active and deleted_at is null
      and (p_series_id is null or id = p_series_id)
  loop
    v_day := greatest(
      v_series.anchor_date,
      (now() at time zone v_series.timezone)::date
    );
    for v_day in
      select d::date
      from generate_series(v_day, v_day + p_horizon_days, interval '1 day') d
    loop
      if private.rrule_matches(v_series.rrule, v_series.anchor_date, v_day) then
        -- Local wall-clock time interpreted in the series timezone: correct
        -- across DST transitions by definition.
        v_starts := (v_day + v_series.start_time) at time zone v_series.timezone;
        insert into public.mic_occurrences (series_id, local_date, starts_at, doors_at)
        values (
          v_series.id,
          v_day,
          v_starts,
          case when v_series.doors_offset > interval '0'
               then v_starts - v_series.doors_offset end
        )
        on conflict (series_id, local_date) do nothing;
        get diagnostics v_count = row_count;
        v_inserted := v_inserted + v_count;
      end if;
    end loop;
  end loop;
  return v_inserted;
end;
$$;

-- Generate the window immediately when a series is created or its recurrence
-- fields change. The nightly job (scheduled in a later phase) keeps the
-- rolling window topped up.
create or replace function private.series_generate_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.generate_occurrences(new.id);
  return new;
end;
$$;
create trigger mic_series_generate after insert
  or update of rrule, anchor_date, start_time, doors_offset, timezone, is_active
  on mic_series
  for each row when (new.is_active and new.deleted_at is null)
  execute function private.series_generate_trigger();

-- ---------------------------------------------------------------------------
-- Signups
-- ---------------------------------------------------------------------------
create table signups (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null references mic_occurrences (id),
  performer_id   uuid not null references profiles (id),
  status         signup_status not null default 'requested',
  slot_position  smallint,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (occurrence_id, performer_id)
);
create index signups_performer_idx on signups (performer_id, created_at desc);
create index signups_occurrence_idx on signups (occurrence_id, slot_position);
create trigger signups_updated_at before update on signups
  for each row execute function private.set_updated_at();

-- True when a block exists between the performer and the person who runs
-- the occurrence's series (either direction). Blocked performers cannot
-- join that producer's lists.
create or replace function private.is_blocked_by_producer(p_occurrence_id uuid, p_performer uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.mic_occurrences o
    join public.mic_series s on s.id = o.series_id
    where o.id = p_occurrence_id
      and coalesce(s.owner_id, s.created_by) is not null
      and private.is_blocked_pair(coalesce(s.owner_id, s.created_by), p_performer)
  );
$$;

-- Owner-of-the-series check used by several policies.
create or replace function private.owns_occurrence_series(p_occurrence_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.mic_occurrences o
    join public.mic_series s on s.id = o.series_id
    where o.id = p_occurrence_id
      and (s.owner_id = auth.uid()
           or (s.owner_id is null and s.created_by = auth.uid()))
  );
$$;

alter table signups enable row level security;
create policy "signups performer select own" on signups
  for select to authenticated using (performer_id = (select auth.uid()));
create policy "signups producer select" on signups
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id) or private.is_admin());
create policy "signups performer insert" on signups
  for insert to authenticated
  with check (
    performer_id = (select auth.uid())
    and status = 'requested'
    and slot_position is null
    and not private.is_blocked_by_producer(occurrence_id, (select auth.uid()))
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_performer and p.deleted_at is null
    )
    and exists (
      select 1 from public.mic_occurrences o
      join public.mic_series s on s.id = o.series_id
      where o.id = occurrence_id
        and o.status = 'scheduled'
        and s.signup_method <> 'host_booked'
        and now() >= o.starts_at - s.signup_opens
        and now() <= o.starts_at - s.signup_closes
    )
  );
create policy "signups performer withdraw" on signups
  for delete to authenticated using (performer_id = (select auth.uid()));
create policy "signups producer update" on signups
  for update to authenticated
  using (private.owns_occurrence_series(occurrence_id) or private.is_admin());

create table favorites (
  profile_id  uuid not null references profiles (id) on delete cascade,
  series_id   uuid not null references mic_series (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, series_id)
);
alter table favorites enable row level security;
create policy "favorites owner all" on favorites
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Personal, self-reported performance history. Never producer-facing.
create table attendance_log (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles (id) on delete cascade,
  series_id      uuid references mic_series (id),
  occurrence_id  uuid references mic_occurrences (id),
  performed_on   date not null,
  note           text check (char_length(note) <= 500),
  created_at     timestamptz not null default now()
);
create index attendance_log_profile_idx on attendance_log (profile_id, performed_on desc);
alter table attendance_log enable row level security;
create policy "attendance owner all" on attendance_log
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
