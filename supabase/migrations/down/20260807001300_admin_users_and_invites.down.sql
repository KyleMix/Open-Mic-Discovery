-- Reverses 20260807001300_admin_users_and_invites.sql.
--
-- Order matters. The allowlist is dropped last, because private.admin_bit_for()
-- reads it and the profiles guard calls that function: restoring the guard to
-- its previous body first means no write to profiles can reach a table that is
-- about to disappear.
--
-- What this loses: every allowlist row and every invitation. profiles.is_admin
-- keeps whatever value it holds at the time, and becomes the source of truth
-- again rather than a cache, which is what the restored guard body assumes.
-- Audit rows written by the RPCs stay, because admin.audit_log is append only
-- and 20260807001200 owns it.

drop function if exists admin_invite(text, text, text, inet, interval);
drop function if exists admin_invite_revoke(uuid, text, inet);
drop function if exists admin_invite_accept(text);
drop function if exists admin_set_role(uuid, text, text, inet);
drop function if exists admin_set_active(uuid, boolean, text, inet);

-- The bootstrap stops seeding the allowlist. Body as it stood in 20260807000400.
create or replace function private.bootstrap_owner_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_admin and exists (
    select 1
    from auth.users u
    where u.id = new.id
      and u.email_confirmed_at is not null
      and private.is_owner_email(u.email)
  ) then
    insert into public.performer_profiles (profile_id) values (new.id)
      on conflict (profile_id) do nothing;
    insert into public.producer_profiles (profile_id, verified) values (new.id, true)
      on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

-- The guard goes back to pinning is_admin to its previous value, which is the
-- 20260807001000 body. F-B stays closed either way.
create or replace function private.guard_profile_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
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

-- actor_role goes back to deriving from the owner email and is_admin, which is
-- the 20260807001200 body.
create or replace function admin.actor_role()
returns admin.admin_role
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'an audit entry needs a session: there is no actor here'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from auth.users u
    where u.id = v_uid
      and u.email_confirmed_at is not null
      and private.is_owner_email(u.email)
  ) then
    return 'owner';
  end if;
  if private.is_admin() then
    return 'moderator';
  end if;
  raise exception 'only an admin can be the actor on an audit entry'
    using errcode = '42501';
end;
$$;

drop function if exists admin.require_owner();
drop function if exists private.new_invite_token();
drop function if exists private.invite_token_hash(text);

drop trigger if exists admin_users_sync_profile on admin.admin_users;
drop function if exists admin.sync_admin_bit();

drop table if exists admin.admin_invites;
drop table if exists admin.admin_users;

drop function if exists private.admin_bit_for(uuid);
