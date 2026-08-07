-- Admin cannot be granted from a session, by anyone, including an admin.
--
-- Finding F-B. Before 20260807001000 every assertion in the first block here
-- failed: private.guard_profile_writes() skipped its whole body for an admin
-- caller, so `update profiles set is_admin = true` from an admin session was
-- applied as written.
--
-- Seed accounts used: 0004 is an admin whose email is not the owner email,
-- 0001 is a plain performer, 0005 is the owner.
begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- An admin cannot promote anyone else.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);

-- The row is visible and writable to this caller (the admin policies allow
-- both), so a refusal here is the guard and not row level security hiding the
-- row. Proving that first makes the next assertion mean what it says.
select is(
  (select count(*)::int from profiles where id = '00000000-0000-4000-a000-000000000001'),
  1,
  'an admin can see another profile row, so the write below is not filtered out'
);

update profiles set is_admin = true
where id = '00000000-0000-4000-a000-000000000001';
select is(
  (select is_admin from profiles where id = '00000000-0000-4000-a000-000000000001'),
  false,
  'an admin cannot grant admin to another user'
);

-- The same write with other columns alongside it, because a moderator editing a
-- profile legitimately is the case where this would slip through.
update profiles set bio = 'edited by a moderator', is_admin = true
where id = '00000000-0000-4000-a000-000000000001';
select is(
  (select is_admin from profiles where id = '00000000-0000-4000-a000-000000000001'),
  false,
  'and cannot smuggle the grant in alongside a legitimate edit'
);
select is(
  (select bio from profiles where id = '00000000-0000-4000-a000-000000000001'),
  'edited by a moderator',
  'while the legitimate part of that edit still applies'
);

-- Demotion is blocked in the same way, in both directions: an admin cannot
-- strip another admin either, so one compromised session cannot lock the owner
-- out of their own product.
update profiles set is_admin = false
where id = '00000000-0000-4000-a000-000000000005';
select is(
  (select is_admin from profiles where id = '00000000-0000-4000-a000-000000000005'),
  true,
  'an admin cannot revoke another admin either'
);

-- And cannot keep or re-assert it on themselves through a write.
update profiles set is_admin = false where id = auth.uid();
select is(
  (select is_admin from profiles where id = auth.uid()),
  true,
  'an admin cannot demote themselves through a profile write'
);

-- ---------------------------------------------------------------------------
-- A non-admin still cannot self-grant. This held before the change and the
-- point of repeating it here is that it still holds after.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
update profiles set is_admin = true where id = auth.uid();
select is(
  (select is_admin from profiles where id = auth.uid()),
  false,
  'a plain user still cannot self-grant admin'
);
reset role;

-- ---------------------------------------------------------------------------
-- The owner bootstrap is the one path that still grants, and it still works.
-- Insert order matters: profiles_guard forces false, then
-- profiles_owner_bootstrap puts it back for a confirmed owner address.
-- ---------------------------------------------------------------------------
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token,
   reauthentication_token)
values
  ('00000000-0000-4000-a000-0000000000fd', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'KyleWMixon@gmail.com', 'x', now(),
   '{}', '{}', now(), now(), '', '', '', '', '', '', '', '');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000fd","role":"authenticated"}', true);
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      birth_year, eula_version)
values ('00000000-0000-4000-a000-0000000000fd', 'owner_confirmed', 'Kyle', 'Kyle',
        'Seattle', 'WA', 1990,
        (select version from eula_versions order by published_at desc limit 1));
reset role;

select ok(
  (select is_admin from profiles where id = '00000000-0000-4000-a000-0000000000fd'),
  'a confirmed sign-up on the owner email is still promoted by the bootstrap'
);

-- An unconfirmed address is still refused (20260807000400), so pinning
-- is_admin did not accidentally make the bootstrap unconditional.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token,
   reauthentication_token)
values
  ('00000000-0000-4000-a000-0000000000fc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'kylewmixon@Gmail.com', 'x', null,
   '{}', '{}', now(), now(), '', '', '', '', '', '', '', '');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000fc","role":"authenticated"}', true);
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      birth_year, eula_version)
values ('00000000-0000-4000-a000-0000000000fc', 'owner_unconfirmed2', 'Kyle', 'Kyle',
        'Seattle', 'WA', 1990,
        (select version from eula_versions order by published_at desc limit 1));
reset role;
select ok(
  (select not is_admin from profiles where id = '00000000-0000-4000-a000-0000000000fc'),
  'an unconfirmed owner address is still refused'
);

-- ---------------------------------------------------------------------------
-- The service role seam is unchanged: no auth.uid() means the guard steps
-- aside, which is how the seed, migrations, and platform work operate.
--
-- reset role drops the database role but leaves request.jwt.claims set, and the
-- guard keys off auth.uid() rather than the role, so the claims have to go too.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
update profiles set is_admin = true
where id = '00000000-0000-4000-a000-000000000001';
select ok(
  (select is_admin from profiles where id = '00000000-0000-4000-a000-000000000001'),
  'a caller with no auth.uid() can still set is_admin, which is the documented seam'
);

-- Moderation of held content is untouched: moderate_content still sets
-- moderation_status, which shares the guard this migration edited.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select moderate_content('profile', '00000000-0000-4000-a000-000000000003', false)$$,
  'and an admin can still reject a profile, so the guard edit did not break moderation'
);
reset role;

select * from finish();
rollback;
