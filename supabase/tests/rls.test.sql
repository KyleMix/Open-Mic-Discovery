-- RLS enforcement tests. Runs under pgTAP inside a rolled-back transaction.
-- Impersonation follows the platform mechanism: SET ROLE + request.jwt.claims.
begin;
select plan(27);

-- Seeded demo users:
--   p1 performer, p2 producer, p3 dual role, p4 admin.
-- Helper claims strings are inlined below.

-- 1. Every public table has RLS enabled. No table ships without policies.
select is(
  (select count(*)::int from pg_tables t
   join pg_class c on c.relname = t.tablename
   join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
   where t.schemaname = 'public' and not c.relrowsecurity
     and t.tablename <> 'spatial_ref_sys'),  -- PostGIS-owned, lives in extensions schema on the platform
  0,
  'every table in public has row level security enabled'
);

-- ---------------------------------------------------------------------------
-- Anonymous role
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from mic_series), 20,
  'anon can browse approved series (anonymous discovery)'
);
select is(
  (select count(*)::int from venues), 18,
  'anon can browse approved venues'
);
select cmp_ok(
  (select count(*)::int from mic_occurrences), '>', 0,
  'anon can browse occurrences'
);
select is(
  (select count(*)::int from profiles), 0,
  'anon cannot read the profiles base table'
);
select is(
  (select count(*)::int from producer_profiles), 0,
  'anon cannot read producer_profiles (contact_phone protected)'
);
select is(
  (select count(*)::int from signups), 0,
  'anon cannot read signups'
);
select throws_ok(
  $$insert into venues (name, address_line, city, region, location)
    values ('x', 'x', 'x', 'x', 'POINT(0 0)')$$,
  '42501', null,
  'anon cannot insert venues'
);
-- RLS filters rows from UPDATE silently: the write must affect nothing.
update mic_series set title = 'hacked'
where id = '20000000-0000-4000-c000-000000000001';
select is(
  (select title from mic_series where id = '20000000-0000-4000-c000-000000000001'),
  'Rusty Fret Open Mic',
  'anon update of a series affects zero rows'
);

-- ---------------------------------------------------------------------------
-- Authenticated: performer p1
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

select is(
  (select handle::text from profiles where id = auth.uid()),
  'demo_performer',
  'owner reads own profile through the base table'
);
select is(
  (select count(*)::int from profiles where id <> auth.uid()), 0,
  'non-owner profiles are invisible on the base table'
);
select cmp_ok(
  (select count(*)::int from public_profiles), '>=', 3,
  'public_profiles view exposes other users'
);
select is(
  (select count(*)::int from producer_profiles), 0,
  'performer cannot read any producer_profiles row'
);
update profiles set stage_name = 'gotcha'
where id = '00000000-0000-4000-a000-000000000002';
select is(
  (select count(*)::int from public_profiles
   where id = '00000000-0000-4000-a000-000000000002' and stage_name = 'gotcha'),
  0,
  'update of another user''s profile affects zero rows'
);

-- Self-granting admin is silently neutralized by the guard trigger.
update profiles set is_admin = true where id = auth.uid();
select is(
  (select is_admin from profiles where id = auth.uid()),
  false,
  'is_admin cannot be self-granted'
);

-- Self-deleting the profile is refused by the owner-update WITH CHECK, so a
-- user cannot freeze their own row into a state account deletion never
-- produces. Deletion runs through delete_account_for (SECURITY DEFINER, RLS
-- bypassed), which is unaffected.
select throws_ok(
  $$update profiles set deleted_at = now() where id = auth.uid()$$,
  '42501',
  'new row violates row-level security policy for table "profiles"',
  'a user cannot soft-delete their own profile through the API'
);

-- Free-text edits pass through the automated filter (clean text stays live;
-- moderation.test.sql covers the held path).
update profiles set bio = 'new bio' where id = auth.uid();
select is(
  (select moderation_status from profiles where id = auth.uid()),
  'approved'::moderation_status,
  'clean free-text edits stay live after the filter'
);

select throws_ok(
  $$insert into signups (occurrence_id, performer_id)
    select o.id, '00000000-0000-4000-a000-000000000002'
    from mic_occurrences o
    join mic_series s on s.id = o.series_id
    where s.id = '20000000-0000-4000-c000-000000000009'
      and o.starts_at > now()
    order by o.starts_at limit 1$$,
  '42501', null,
  'cannot create a signup for someone else'
);

-- Signup window enforcement: an occurrence far beyond signup_opens is closed.
select throws_ok(
  $$insert into signups (occurrence_id, performer_id)
    select o.id, auth.uid()
    from mic_occurrences o
    join mic_series s on s.id = o.series_id
    where s.id = '20000000-0000-4000-c000-000000000002'
      and o.starts_at > now() + interval '20 days'
    order by o.starts_at limit 1$$,
  '42501', null,
  'cannot sign up before the signup window opens'
);

-- ---------------------------------------------------------------------------
-- Producer p2: sees signups for owned series only, mutates own series only.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

select cmp_ok(
  (select count(*)::int from signups), '>=', 1,
  'producer sees signups on owned series'
);
select lives_ok(
  $$update mic_series set description = 'Updated description for the Rusty Fret.'
    where id = '20000000-0000-4000-c000-000000000001'$$,
  'producer can update an owned series'
);
update mic_series set title = 'not mine'
where id = '20000000-0000-4000-c000-000000000012';
select is(
  (select title from mic_series where id = '20000000-0000-4000-c000-000000000012'),
  'Burnside Comedy Lab',
  'producer update of someone else''s series affects zero rows'
);

-- ---------------------------------------------------------------------------
-- Blocking: p2 blocks p3. Server-side filtering, both surfaces.
-- ---------------------------------------------------------------------------
insert into blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003');

select is(
  (select count(*)::int from public_profiles
   where id = '00000000-0000-4000-a000-000000000003'),
  0,
  'blocked user disappears from the blocker''s profile reads'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::int from public_profiles
   where id = '00000000-0000-4000-a000-000000000002'),
  0,
  'the block filters in both directions'
);
select throws_ok(
  $$insert into signups (occurrence_id, performer_id)
    select o.id, auth.uid()
    from mic_occurrences o
    join mic_series s on s.id = o.series_id
    where s.id = '20000000-0000-4000-c000-000000000009'
      and o.starts_at > now()
    order by o.starts_at limit 1$$,
  '42501', null,
  'blocked performer cannot sign up for the blocker''s mic'
);

-- ---------------------------------------------------------------------------
-- View column privacy
-- ---------------------------------------------------------------------------
select hasnt_column('public', 'producer_public', 'contact_phone',
  'producer_public never exposes contact_phone');
select hasnt_column('public', 'public_profiles', 'home_location',
  'public_profiles never exposes home_location');

select * from finish();
rollback;
