-- Producer tools: trustworthy confirmation stamps, reconciliation of future
-- occurrences on series edits, claim review, and the nightly generator job.

-- ---------------------------------------------------------------------------
-- One-tap confirm, unforgeable. Any user-initiated change to the
-- last_confirmed fields is overwritten with a server stamp, so a producer
-- "confirms" by touching the column and can never backdate freshness.
-- ---------------------------------------------------------------------------
create or replace function private.guard_series_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (new.last_confirmed_at is distinct from old.last_confirmed_at
          or new.last_confirmed_by is distinct from old.last_confirmed_by) then
    new.last_confirmed_at := now();
    new.last_confirmed_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger mic_series_confirm_guard before update on mic_series
  for each row execute function private.guard_series_confirm();

-- ---------------------------------------------------------------------------
-- "This and all future": when recurrence fields change, reconcile the
-- materialized window instead of only appending.
--   1. Future scheduled nights that no longer match the rule are removed,
--      unless a human touched them (override, cancellation, or any signup).
--   2. Remaining scheduled nights get their starts_at recomputed from the
--      new local time, DST-correct.
--   3. The generator tops up the window (never clobbering anything).
-- Deactivating or soft-deleting a series clears its untouched future nights.
-- ---------------------------------------------------------------------------
create or replace function private.reconcile_future_occurrences(p_series_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series record;
  v_today  date;
begin
  select * into v_series from public.mic_series where id = p_series_id;
  if not found then
    return;
  end if;
  v_today := (now() at time zone v_series.timezone)::date;

  if not v_series.is_active or v_series.deleted_at is not null then
    delete from public.mic_occurrences o
    where o.series_id = p_series_id
      and o.local_date > v_today
      and o.status = 'scheduled'
      and o.override_title is null
      and o.override_cost_cents is null
      and o.override_venue_id is null
      and o.cancellation_note is null
      and not exists (select 1 from public.signups sg where sg.occurrence_id = o.id);
    return;
  end if;

  delete from public.mic_occurrences o
  where o.series_id = p_series_id
    and o.local_date > v_today
    and o.status = 'scheduled'
    and o.override_title is null
    and o.override_cost_cents is null
    and o.override_venue_id is null
    and o.cancellation_note is null
    and not exists (select 1 from public.signups sg where sg.occurrence_id = o.id)
    and not private.rrule_matches(v_series.rrule, v_series.anchor_date, o.local_date);

  update public.mic_occurrences o
  set starts_at = (o.local_date + v_series.start_time) at time zone v_series.timezone,
      doors_at = case
        when v_series.doors_offset > interval '0'
        then ((o.local_date + v_series.start_time) at time zone v_series.timezone)
             - v_series.doors_offset
      end
  where o.series_id = p_series_id
    and o.local_date > v_today
    and o.status = 'scheduled';

  perform private.generate_occurrences(p_series_id);
end;
$$;

-- Replace the append-only trigger with the reconciling one, firing on both
-- activation states so deactivation cleans up.
drop trigger if exists mic_series_generate on mic_series;
create or replace function private.series_reconcile_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reconcile_future_occurrences(new.id);
  return new;
end;
$$;
create trigger mic_series_generate after insert
  or update of rrule, anchor_date, start_time, doors_offset, timezone, is_active, deleted_at
  on mic_series
  for each row execute function private.series_reconcile_trigger();

-- ---------------------------------------------------------------------------
-- Claim review (admin-reviewed workflow, v1). SECURITY DEFINER because
-- approval touches three tables the reviewer does not own.
-- ---------------------------------------------------------------------------
create or replace function review_claim(p_claim_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim record;
begin
  if not private.is_admin() then
    raise exception 'only admins can review claims' using errcode = '42501';
  end if;
  select * into v_claim from public.claim_requests where id = p_claim_id and status = 'pending';
  if not found then
    raise exception 'claim not found or not pending';
  end if;

  update public.claim_requests
  set status = case when p_approve then 'approved' else 'rejected' end::public.claim_status,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_claim_id;

  if p_approve then
    insert into public.producer_profiles (profile_id)
    values (v_claim.requester_id)
    on conflict (profile_id) do nothing;
    update public.profiles set is_producer = true where id = v_claim.requester_id;
    update public.mic_series set owner_id = v_claim.requester_id where id = v_claim.series_id;
    -- Competing pending claims for the now-claimed series are closed out.
    update public.claim_requests
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where series_id = v_claim.series_id and status = 'pending';
  end if;
end;
$$;
grant execute on function review_claim to authenticated;

-- ---------------------------------------------------------------------------
-- Nightly top-up of the rolling 90-day window. pg_cron where available
-- (hosted Supabase); environments without it schedule
-- `select private.generate_occurrences()` externally.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'generate-occurrences-nightly',
    '17 9 * * *',  -- 09:17 UTC, quiet hour for US timezones
    'select private.generate_occurrences()'
  );
exception when others then
  raise notice 'pg_cron unavailable here; schedule private.generate_occurrences() nightly externally';
end $$;
