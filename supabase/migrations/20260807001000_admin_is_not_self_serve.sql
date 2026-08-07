-- Admin is not self serve: is_admin stops being writable from a session.
--
-- Finding F-B (docs/admin/SCHEMA-REPORT.md section 1). Two facts that are each
-- defensible alone combined into a privilege escalation reachable from a phone:
--
--   1. The policy `profiles admin update` is
--      `for update to authenticated using ((select private.is_admin()))`
--      with no WITH CHECK clause, so an admin may update any column of any
--      profile row. That is what makes the moderation queue work, so it is
--      not wrong on its own.
--   2. private.guard_profile_writes() opens with
--      `if auth.uid() is not null and not private.is_admin() then`, so for a
--      caller who is already an admin the entire guard body is skipped,
--      is_admin included.
--
-- Together: any admin could PATCH /rest/v1/profiles?id=eq.<anyone> with
-- {"is_admin": true} and mint another admin. No audit row, no reason, no
-- second factor, no console. One compromised moderator session was enough to
-- make the compromise permanent and to reach the test kit, which mints
-- sign-ins.
--
-- Why the fix is in the trigger and not in the policy. A policy sees only the
-- proposed row, never the row it replaces, so "is_admin is unchanged" is not
-- expressible as a WITH CHECK. The nearest expressible thing,
-- `with check (not is_admin)`, would forbid an admin from editing an admin's
-- profile at all, including their own. Field level integrity belongs in the
-- trigger, which is where this schema has always put it (ARCHITECTURE.md,
-- 2026-07-28: "RLS controls row access; triggers control field-level
-- integrity").
--
-- What changes: is_admin is now pinned for every write that carries a session,
-- admin or not. What does not change: the non-admin branch (eula stamps,
-- moderation_status, the banned-term filter) is copied verbatim from
-- 20260730000300, so moderate_content keeps setting moderation_status
-- explicitly and an admin's own profile edits keep skipping the filter.
--
-- Who can still grant admin after this:
--
--   - private.bootstrap_owner_profile(), the BEFORE INSERT trigger that reads
--     private.owner_emails() and requires auth.users.email_confirmed_at. It
--     sorts after profiles_guard by trigger name, so it still wins on insert.
--   - Any caller with no auth.uid(): the service role, and a migration. That
--     is the documented seam for platform level work and it is unchanged.
--
-- Who can no longer grant admin: an admin, through the API. Note the
-- consequence honestly, because it is a functional regression until the
-- console's audited admin management lands: there is currently no in-product
-- way to appoint a second moderator. Today that costs nothing, because the
-- only admin path that has ever existed is the single hard-coded owner email,
-- so no second moderator exists to lose. The replacement is admin_users plus
-- an owner-only, audited, step-up-reauthenticated RPC, which is Phase 1 of
-- the moderation console.
--
-- Down migration:
-- supabase/migrations/down/20260807001000_admin_is_not_self_serve.down.sql

create or replace function private.guard_profile_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    -- Unconditional, admins included. The owner bootstrap trigger runs after
    -- this one and is the only thing that may put the bit back.
    if tg_op = 'INSERT' then
      new.is_admin := false;
    else
      new.is_admin := old.is_admin;
    end if;

    if not private.is_admin() then
      if tg_op = 'INSERT' then
        new.eula_accepted_at := now();
        new.moderation_status := case
          when private.text_is_clean(new.display_name, new.bio, new.handle::text)
               and private.text_is_clean(new.stage_name, null, null)
          then 'approved' else 'pending' end;
      else
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
  end if;
  return new;
end;
$$;

comment on function private.guard_profile_writes() is
  'Field level integrity on profiles. is_admin is pinned for every write that '
  'carries a session, so admin cannot be granted through the API by anyone, '
  'including an admin. Only the owner bootstrap trigger and callers with no '
  'auth.uid() (service role, migrations) can set it.';
