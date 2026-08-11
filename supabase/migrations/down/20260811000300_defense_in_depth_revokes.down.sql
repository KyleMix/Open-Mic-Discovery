-- Revert: restore the blanket grants these tables and this function would have
-- carried from 20260728001200's `grant all ... to anon, authenticated`.

grant execute on function private.delete_account_for(uuid) to anon, authenticated;

grant insert, update, delete on public.connections to anon;
grant insert, update, delete on public.mic_credits to anon;
grant insert, update, delete on public.attendance_plans to anon;
grant insert, update, delete on public.series_search to anon, authenticated;
