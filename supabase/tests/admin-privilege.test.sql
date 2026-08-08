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
select plan(12);

-- ---------------------------------------------------------------------------
-- An admin cannot promote anyone else.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);

-- The row is writable by this caller, so a refusal below is the guard and not
-- row level security hiding the row. Proving that first makes the next assertion
-- mean what it says.
--
-- Read through admin_profile_review rather than profiles: since 20260807001600
-- an admin has no select policy on the base table, and the assertions further
-- down read stored state with the role reset for the same reason.
select is(
  (select count(*)::int from admin_profile_review
    where id = '00000000-0000-4000-a000-000000000001'),
  1,
  'an admin can see another profile through the review view, so the write below is not filtered out'
);

-- Since 20260807001600 there are two independent reasons this write cannot
-- promote anybody, and both are worth asserting because either alone would make
-- the other untestable. First: the row is no longer visible to the write at all.
-- An UPDATE whose WHERE clause reads the table needs a SELECT policy as well as
-- an UPDATE policy, and admins have neither on profiles now, so the statement
-- matches nothing.
with attempt as (
  update profiles set bio = 'edited by a moderator', is_admin = true
   where id = '00000000-0000-4000-a000-000000000001'
  returning id
)
select is(
  (select count(*)::int from attempt),
  0,
  'a raw cross-user profile write from an admin now matches no rows at all'
);
reset role;
select is(
  (select is_admin from profiles where id = '00000000-0000-4000-a000-000000000001'),
  false,
  'so it cannot grant admin to another user'
);
select is(
  (select bio from profiles where id = '00000000-0000-4000-a000-000000000001'),
  'Acoustic sets and the occasional poem.',
  'and the legitimate half of the same statement does not land either'
);

-- Demotion is blocked in the same way, in both directions: an admin cannot
-- strip another admin either, so one compromised session cannot lock the owner
-- out of their own product.
set local role authenticated;
update profiles set is_admin = false
where id = '00000000-0000-4000-a000-000000000005';
reset role;
select is(
  (select is_admin from profiles where id = '00000000-0000-4000-a000-000000000005'),
  true,
  'an admin cannot revoke another admin either'
);

-- The second reason, and the one the guard is actually for: a write that DOES
-- land still cannot move the column. An admin's own row is visible and writable
-- to them through the owner policies, so this statement matches a row and the
-- guard is the only thing standing between it and a demotion.
set local role authenticated;
with attempt as (
  update profiles set is_admin = false where id = auth.uid() returning id
)
select is(
  (select count(*)::int from attempt),
  1,
  'an admin write to their own row does match, so the guard is what is under test here'
);
select is(
  (select is_admin from profiles where id = auth.uid()),
  true,
  'and the guard re-derives the column from the allowlist, so they stay an admin'
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
