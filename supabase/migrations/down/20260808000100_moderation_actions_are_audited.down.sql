-- Undo 20260808000100: moderation actions stop writing audit rows.
-- Restores the pre-audit definitions of moderate_content, resolve_flag, and
-- review_claim exactly as they stood after 20260807000900, and removes the
-- report resolution trigger. Existing audit rows are left alone: the log is
-- append only and history is not erased by a rollback.

drop trigger if exists reports_audit_resolution on public.reports;
drop function if exists private.audit_report_resolution();

create or replace function public.moderate_content(
  p_target public.report_target,
  p_target_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.moderation_status :=
    case when p_approve then 'approved' else 'rejected' end;
begin
  if not private.is_admin() then
    raise exception 'only admins can moderate content' using errcode = '42501';
  end if;
  if p_target = 'profile' then
    update public.profiles set moderation_status = v_status where id = p_target_id;
  elsif p_target = 'venue' then
    update public.venues set moderation_status = v_status where id = p_target_id;
  elsif p_target = 'series' then
    update public.mic_series set moderation_status = v_status where id = p_target_id;
  elsif p_target = 'credit' then
    update public.mic_credits set moderation_status = v_status where id = p_target_id;
  else
    raise exception 'unsupported moderation target %', p_target;
  end if;
end;
$$;

create or replace function public.resolve_flag(p_flag_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag public.listing_flags%rowtype;
  v_series public.mic_series%rowtype;
begin
  if not private.is_admin() then
    raise exception 'only moderators can resolve flags' using errcode = '42501';
  end if;
  select * into v_flag from public.listing_flags where id = p_flag_id;
  if not found then
    raise exception 'flag not found' using errcode = 'P0002';
  end if;

  update public.listing_flags
  set status = case when p_confirm then 'confirmed' else 'dismissed' end::public.flag_status,
      resolved_by = auth.uid(),
      resolved_at = now()
  where id = p_flag_id;

  if p_confirm and v_flag.reason = 'permanently_dead' then
    update public.mic_series
    set is_active = false
    where id = v_flag.series_id and is_active
    returning * into v_series;
    if found and v_series.owner_id is not null then
      insert into public.notification_outbox (profile_id, kind, title, body, payload)
      values (
        v_series.owner_id,
        'listing_auto_paused',
        v_series.title,
        'Paused: a performer reported this mic is no longer running and a '
          || 'moderator confirmed it. If it still runs, resume it from My Mics '
          || 'and confirm the listing.',
        jsonb_build_object('series_id', v_series.id)
      );
    end if;
  end if;
end;
$$;

create or replace function public.review_claim(p_claim_id uuid, p_approve boolean)
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
    update public.claim_requests
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where series_id = v_claim.series_id and status = 'pending';
  end if;
end;
$$;
