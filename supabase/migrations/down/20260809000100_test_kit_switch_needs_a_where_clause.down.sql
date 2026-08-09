-- Undo 20260809000100, restoring the body 20260801000100 shipped.
--
-- This puts the defect back: without the WHERE clause, test_kit_set_enabled
-- answers 21000 for every caller that reaches it through PostgREST, because
-- pg_safeupdate is preloaded for the API roles. Run it only to get back to a
-- known earlier state, never as a fix.

create or replace function test_kit_set_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'the test kit is admin only' using errcode = '42501';
  end if;
  update public.test_kit_settings set enabled = p_enabled, updated_at = now();
  return jsonb_build_object('enabled', p_enabled);
end;
$$;
grant execute on function test_kit_set_enabled to authenticated;
