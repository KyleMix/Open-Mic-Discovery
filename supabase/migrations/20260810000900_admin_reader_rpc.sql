-- Read-only admins could not open the screen their role exists for: the app
-- gates the moderation queue on profiles.is_admin (the write predicate),
-- while read_only reviewers live in admin.admin_users, which the client
-- cannot see. This exposes the existing reader predicate so the app can
-- show them the queue and hide only the action buttons; every write path
-- still checks the stronger is_admin server side.
create or replace function am_admin_reader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_admin_reader(), false);
$$;
grant execute on function am_admin_reader to authenticated;
