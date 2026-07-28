-- Social links and avatar storage tests.
begin;
select plan(12);

-- Seeded demo users: p1 performer 00000000-...-0001, p2 producer ...-0002.

-- ---------------------------------------------------------------------------
-- Link format constraints
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true
);

update profiles
set link_instagram = 'sage.strings',
    link_tiktok = 'sagestrings',
    link_youtube = 'https://youtube.com/@sagestrings',
    link_website = 'https://sagestrings.example.com'
where id = '00000000-0000-4000-a000-000000000001';
select is(
  (select link_instagram from profiles
   where id = '00000000-0000-4000-a000-000000000001'),
  'sage.strings',
  'owner can set well-formed social links'
);

select throws_ok(
  $$update profiles set link_instagram = '@sage.strings'
    where id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null,
  'instagram handle rejects a leading @ (stored bare)'
);
select throws_ok(
  $$update profiles set link_tiktok = 'has spaces'
    where id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null,
  'tiktok handle rejects spaces'
);
select throws_ok(
  $$update profiles set link_youtube = 'http://youtube.com/@x'
    where id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null,
  'youtube link must be https'
);
select throws_ok(
  $$update profiles set link_website = 'javascript:alert(1)'
    where id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null,
  'website link rejects non-https schemes'
);

-- ---------------------------------------------------------------------------
-- Public exposure through the view
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

select is(
  (select link_instagram from public_profiles
   where id = '00000000-0000-4000-a000-000000000001'),
  'sage.strings',
  'social links are public through public_profiles'
);
select is(
  (select count(*)::int from profiles
   where id = '00000000-0000-4000-a000-000000000001'),
  0,
  'links did not open the base table to anon'
);

-- ---------------------------------------------------------------------------
-- Avatar storage policies
-- ---------------------------------------------------------------------------
select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'avatars bucket exists and is public'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true
);

insert into storage.objects (bucket_id, name)
values ('avatars', '00000000-0000-4000-a000-000000000001/avatar.jpg');
select is(
  (select count(*)::int from storage.objects
   where name = '00000000-0000-4000-a000-000000000001/avatar.jpg'),
  1,
  'user can upload into their own avatar folder'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', '00000000-0000-4000-a000-000000000002/avatar.jpg')$$,
  '42501', null,
  'user cannot upload into another user''s folder'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  1,
  'avatar objects are publicly readable'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', 'anonymous/avatar.jpg')$$,
  '42501', null,
  'anon cannot upload avatars'
);

select * from finish();
rollback;
