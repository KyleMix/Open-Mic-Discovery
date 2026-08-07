-- Admins can action a reported credit.
--
-- Second half of audit finding F-011; 20260807000800 added the enum value.
-- Reporting a credit is only useful if the report can be acted on, and until
-- now moderate_content raised "unsupported moderation target" for anything
-- outside profile, venue, and series.
--
-- mic_credits already has everything the branch needs: a moderation_status
-- column, an admin select policy, and an admin update policy (20260801001100).
-- Rejecting a credit removes it from mic_credit_public, which filters on
-- `moderation_status = 'approved'`, so the listing falls back to whatever
-- name was typed and the linked person stops being advertised.
--
-- Body otherwise copied verbatim from 20260728001000.
--
-- Down migration:
-- supabase/migrations/down/20260807000900_credit_moderation.down.sql

create or replace function moderate_content(
  p_target report_target,
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
