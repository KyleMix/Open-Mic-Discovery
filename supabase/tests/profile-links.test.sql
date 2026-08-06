-- Social links and avatar storage tests.
begin;
select plan(18);

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
-- Read as the test role: the storage service hides bucket rows from the API
-- roles, so this asserted NULL when run as anon.
reset role;
select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'avatars bucket exists and is public'
);

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

-- ---------------------------------------------------------------------------
-- Spotify and Apple Music. Stored as full https URLs rather than handles:
-- neither service publishes a stable username format, and both hand out share
-- links that already carry the artist id.
-- ---------------------------------------------------------------------------
select has_column('public', 'profiles', 'link_spotify', 'profiles has link_spotify');
select has_column('public', 'profiles', 'link_apple_music', 'profiles has link_apple_music');

select has_column('public', 'public_profiles', 'link_spotify',
  'link_spotify reaches readers through public_profiles');
select has_column('public', 'public_profiles', 'link_apple_music',
  'link_apple_music reaches readers through public_profiles');

-- Back to the owning role: by this point the file is running as anon, and an
-- update that row level security filters to zero rows never reaches the check
-- constraint, so the assertion would pass for the wrong reason.
reset role;

-- The constraints have to match link_youtube and link_website, so anything the
-- client's normalizeUrl produces is accepted and anything it rejects is too.
select throws_ok(
  $$update public.profiles set link_spotify = 'http://open.spotify.com/artist/x'
      where handle = 'demo_performer'$$,
  '23514', null,
  'a plain http Spotify link is refused, as it is for every other link column'
);
select throws_ok(
  $$update public.profiles set link_apple_music = 'notalink'
      where handle = 'demo_performer'$$,
  '23514', null,
  'a bare word is refused as an Apple Music link'
);

select * from finish();
rollback;
