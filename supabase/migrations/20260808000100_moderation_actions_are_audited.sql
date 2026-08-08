-- Every moderator action writes an audit row.
--
-- 20260807001200 built the append-only audit log and stated plainly that it
-- wired nothing to it: moderate_content, resolve_flag, review_claim, and the
-- direct reports update all predate the required reason string, and the
-- console's own RPCs were expected to be the first writers. The store
-- readiness pass (2026-08-08) closes that gap now, because the takedown path
-- that Apple's Guideline 1.2 review will exercise is the in-app one, and a
-- takedown that leaves no audit row fails the standard the log was built to
-- set.
--
-- Approach: each RPC keeps its exact signature and behavior and appends one
-- audit row describing what changed, with before and after state. The reason
-- strings are generated server side and say where the decision came from and
-- what it acted on; they are specific enough to explain the row later, which
-- is the bar the audit_log reason column sets. When the console ships with
-- free-text reasons, its RPCs can pass richer ones through the same
-- append_audit.
--
-- Two deliberate consequences:
--
--   1. If admin.append_audit refuses (actor not on the admin.admin_users
--      allowlist, or no AAL2 when enforcement is on), the whole action rolls
--      back. An unauditable moderation action failing loudly is the designed
--      behavior, not a bug: 20260807001000 made profiles.is_admin follow the
--      allowlist, so the two cannot legitimately disagree.
--   2. Report resolutions with no session (service role automation, the
--      seed, test kit resets) append nothing, matching audit design
--      decision 2: an automated state change is not a moderator action.
--
-- Down migration: supabase/migrations/down/20260808000100_moderation_actions_are_audited.down.sql

-- ---------------------------------------------------------------------------
-- 1. moderate_content: approve or reject held or reported content
-- ---------------------------------------------------------------------------
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
  v_before public.moderation_status;
begin
  if not private.is_admin() then
    raise exception 'only admins can moderate content' using errcode = '42501';
  end if;
  if p_target = 'profile' then
    select moderation_status into v_before from public.profiles where id = p_target_id;
    update public.profiles set moderation_status = v_status where id = p_target_id;
  elsif p_target = 'venue' then
    select moderation_status into v_before from public.venues where id = p_target_id;
    update public.venues set moderation_status = v_status where id = p_target_id;
  elsif p_target = 'series' then
    select moderation_status into v_before from public.mic_series where id = p_target_id;
    update public.mic_series set moderation_status = v_status where id = p_target_id;
  elsif p_target = 'credit' then
    select moderation_status into v_before from public.mic_credits where id = p_target_id;
    update public.mic_credits set moderation_status = v_status where id = p_target_id;
  else
    raise exception 'unsupported moderation target %', p_target;
  end if;

  perform admin.append_audit(
    p_action      => case when p_approve then 'content.approve' else 'content.reject' end,
    p_target_type => p_target::text,
    p_target_id   => p_target_id,
    p_before      => jsonb_build_object('moderation_status', v_before),
    p_after       => jsonb_build_object('moderation_status', v_status),
    p_reason      => 'In-app moderation screen decision on a '
                     || p_target::text || ' (held content or abuse report queue).',
    p_request_ip  => null,
    p_reverses_id => null,
    p_reversible  => true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. resolve_flag: confirm or dismiss a data-quality flag
-- ---------------------------------------------------------------------------
create or replace function public.resolve_flag(p_flag_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag public.listing_flags%rowtype;
  v_series public.mic_series%rowtype;
  v_paused boolean := false;
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

  -- A confirmed dead report pauses the listing so it stops generating
  -- nights and drops out of discovery. The owner can resume any time.
  if p_confirm and v_flag.reason = 'permanently_dead' then
    update public.mic_series
    set is_active = false
    where id = v_flag.series_id and is_active
    returning * into v_series;
    if found then
      v_paused := true;
      if v_series.owner_id is not null then
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
  end if;

  perform admin.append_audit(
    p_action      => case when p_confirm then 'flag.confirm' else 'flag.dismiss' end,
    p_target_type => 'listing_flag',
    p_target_id   => p_flag_id,
    p_before      => jsonb_build_object('status', v_flag.status,
                                        'series_id', v_flag.series_id,
                                        'reason', v_flag.reason),
    p_after       => jsonb_build_object(
                       'status', case when p_confirm then 'confirmed' else 'dismissed' end,
                       'series_paused', v_paused),
    p_reason      => 'In-app moderation screen decision on a listing flag ('
                     || v_flag.reason::text || ').',
    p_request_ip  => null,
    p_reverses_id => null,
    p_reversible  => true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. review_claim: approve or reject an ownership claim
-- ---------------------------------------------------------------------------
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
    -- Competing pending claims for the now-claimed series are closed out.
    update public.claim_requests
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where series_id = v_claim.series_id and status = 'pending';
  end if;

  perform admin.append_audit(
    p_action      => case when p_approve then 'claim.approve' else 'claim.reject' end,
    p_target_type => 'claim_request',
    p_target_id   => p_claim_id,
    p_before      => jsonb_build_object('status', 'pending',
                                        'series_id', v_claim.series_id,
                                        'requester_id', v_claim.requester_id),
    p_after       => jsonb_build_object(
                       'status', case when p_approve then 'approved' else 'rejected' end),
    p_reason      => 'In-app review of a series ownership claim.',
    p_request_ip  => null,
    p_reverses_id => null,
    -- Approval hands over ownership and grants the producer role; undoing
    -- that is a new decision with its own side effects, not a reversal.
    p_reversible  => false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Report resolution: the app resolves by direct update, so the audit row
--    comes from a trigger on the status transition. Sessions only: an
--    automated update (service role, seed, test kit) is not a moderator
--    action and appends nothing, per the audit log's design decision 2.
-- ---------------------------------------------------------------------------
create or replace function private.audit_report_resolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.status in ('actioned', 'dismissed')
     and old.status not in ('actioned', 'dismissed') then
    perform admin.append_audit(
      p_action      => case when new.status = 'actioned'
                            then 'report.action' else 'report.dismiss' end,
      p_target_type => 'report',
      p_target_id   => new.id,
      p_before      => jsonb_build_object('status', old.status),
      p_after       => jsonb_build_object('status', new.status,
                                          'target_type', new.target_type,
                                          'target_id', new.target_id),
      p_reason      => 'In-app resolution of a ' || new.reason::text
                       || ' report against a ' || new.target_type::text || '.',
      p_request_ip  => null,
      p_reverses_id => null,
      p_reversible  => true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists reports_audit_resolution on public.reports;
create trigger reports_audit_resolution
  after update on public.reports
  for each row
  execute function private.audit_report_resolution();
