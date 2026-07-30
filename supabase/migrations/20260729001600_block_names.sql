-- Names on the blocked-user list.
--
-- Blocking removes the other profile from all of the blocker's queries
-- (by design, server side), which left the Settings unblock list showing
-- anonymous "Blocked user" rows. Snapshot the display name onto the block
-- row at insert time so the list stays meaningful without ever re-exposing
-- the blocked profile. The snapshot is written by a trigger, not the
-- client, so it cannot be spoofed; it is frozen at block time on purpose.

alter table blocks add column blocked_display_name text;

create or replace function private.snapshot_blocked_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.blocked_display_name := (
    select p.display_name from public.profiles p where p.id = new.blocked_id
  );
  return new;
end;
$$;

create trigger blocks_snapshot_name before insert on blocks
  for each row execute function private.snapshot_blocked_name();

-- Backfill blocks created before the column existed.
update blocks b
set blocked_display_name = p.display_name
from profiles p
where p.id = b.blocked_id and b.blocked_display_name is null;
