-- Reverses 20260807001000_admin_is_not_self_serve.sql.
--
-- Restores private.guard_profile_writes() to its 20260730000300 body, in which
-- the whole guard is skipped for a caller who is already an admin. Applying
-- this reopens F-B: any admin can grant admin to anyone through plain REST,
-- unaudited. It exists so the change is reversible, not because reversing it
-- is advisable.

create or replace function private.guard_profile_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.is_admin := false;
      new.eula_accepted_at := now();
      new.moderation_status := case
        when private.text_is_clean(new.display_name, new.bio, new.handle::text)
             and private.text_is_clean(new.stage_name, null, null)
        then 'approved' else 'pending' end;
    else
      new.is_admin := old.is_admin;
      if new.moderation_status is distinct from old.moderation_status then
        new.moderation_status := old.moderation_status;
      end if;
      if new.eula_version is distinct from old.eula_version then
        new.eula_accepted_at := now();
      else
        new.eula_accepted_at := old.eula_accepted_at;
      end if;
      if new.display_name is distinct from old.display_name
         or new.stage_name is distinct from old.stage_name
         or new.bio is distinct from old.bio
         or new.handle is distinct from old.handle then
        new.moderation_status := case
          when private.text_is_clean(new.display_name, new.bio, new.handle::text)
               and private.text_is_clean(new.stage_name, null, null)
          then 'approved' else 'pending' end;
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function private.guard_profile_writes() is null;
