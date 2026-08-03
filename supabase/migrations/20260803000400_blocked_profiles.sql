-- Who did I block? Blocks hide the blocked profile from public_profiles in
-- both directions, so the Settings list could only say "Blocked user". This
-- view lets a blocker, and only the blocker, see the handle and name of the
-- people on their own block list so unblocking is not guesswork.

create view blocked_profiles as
  select
    b.blocked_id,
    b.created_at as blocked_at,
    p.handle,
    p.display_name
  from blocks b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid();
-- Definer semantics on purpose: the whole point is reading a profile the
-- block otherwise hides. The where clause above is the access control.
grant select on blocked_profiles to authenticated;
