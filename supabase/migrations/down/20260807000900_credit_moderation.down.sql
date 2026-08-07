-- Down migration for 20260807000900_credit_moderation.sql.
--
-- Restores moderate_content to the 20260728001000 body, without the credit
-- branch. After this, a report against a credit can still be filed (the enum
-- value is additive and stays, see the 20260807000800 down script) but an
-- admin has no way to action it through this RPC and the call raises
-- "unsupported moderation target credit".
--
-- Not registered with the Supabase CLI (this directory is outside its glob);
-- apply by hand with psql when rolling back.

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
  else
    raise exception 'unsupported moderation target %', p_target;
  end if;
end;
$$;
