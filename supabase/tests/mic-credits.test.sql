-- Featured artist and host credit tests. Runs under pgTAP inside a
-- rolled-back transaction.
--
-- p2 owns the Rusty Fret series (…0001); p1 is an unrelated performer.
begin;
select plan(27);

-- ---------------------------------------------------------------------------
-- Shape and guards
-- ---------------------------------------------------------------------------
select has_table('public', 'mic_credits', 'mic_credits exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.mic_credits'::regclass),
  'mic_credits has row level security, like every other table here'
);

select throws_ok(
  $$insert into public.mic_credits (series_id, role)
    values ('20000000-0000-4000-c000-000000000001', 'host')$$,
  '23514', null,
  'a credit naming nobody, with neither a profile nor a name, is refused'
);

-- An override must override a night of its own series, or a producer could
-- hang a credit on somebody else's listing.
select throws_ok(
  $$insert into public.mic_credits (series_id, occurrence_id, role, name, created_by)
    select '20000000-0000-4000-c000-000000000009', o.id, 'featured', 'Wrong Series',
           '00000000-0000-4000-a000-000000000002'
      from public.mic_occurrences o
      join public.mic_series s on s.id = o.series_id
     where s.id = '20000000-0000-4000-c000-000000000001' limit 1$$,
  'P0001', null,
  'an occurrence override cannot point at another series'
);

-- ---------------------------------------------------------------------------
-- The owning producer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

insert into public.mic_credits (series_id, role, name, link_spotify, created_by)
values ('20000000-0000-4000-c000-000000000001', 'host', 'Marla Quinn',
        'https://open.spotify.com/artist/marla',
        '00000000-0000-4000-a000-000000000002');

select is(
  (select count(*)::int from public.mic_credits
    where series_id = '20000000-0000-4000-c000-000000000001' and role = 'host'),
  1,
  'the owning producer can add a host to their own series'
);

-- Clean text goes live immediately; the filter holds only what it catches.
select is(
  (select moderation_status::text from public.mic_credits
    where series_id = '20000000-0000-4000-c000-000000000001' and role = 'host'),
  'approved',
  'an ordinary performer name is published without waiting on a moderator'
);

-- ---------------------------------------------------------------------------
-- An admin's own writes are trusted: they are the review. Before
-- 20260806000300 the guard skipped admins entirely, so their rows kept the
-- 'pending' default and the owner's own credits never reached the listing.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);

-- owner_id stays null: the admin demo account holds no producer profile,
-- and a null owner leaves the series creator-managed, same as a claim-in-
-- waiting listing.
insert into public.mic_series (id, venue_id, created_by, title, disciplines, rrule,
                               anchor_date, start_time, timezone, signup_method)
values ('20000000-0000-4000-c000-00000000000a', '10000000-0000-4000-b000-000000000001',
        '00000000-0000-4000-a000-000000000004',
        'Admin Showcase', '{comedy}', 'FREQ=WEEKLY;BYDAY=WE', current_date,
        '20:00', 'America/Los_Angeles', 'first_come');
select is(
  (select moderation_status::text from public.mic_series
    where id = '20000000-0000-4000-c000-00000000000a'),
  'approved',
  'an admin-created series is approved on the spot'
);

insert into public.mic_credits (series_id, role, name, created_by)
values ('20000000-0000-4000-c000-00000000000a', 'featured', 'Trusted Guest',
        '00000000-0000-4000-a000-000000000004');
select is(
  (select moderation_status::text from public.mic_credits where name = 'Trusted Guest'),
  'approved',
  'an admin-added credit publishes immediately instead of waiting on themselves'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

insert into public.mic_credits (series_id, role, name, created_by)
values ('20000000-0000-4000-c000-000000000009', 'featured', 'kys comedy hour',
        '00000000-0000-4000-a000-000000000002');
select is(
  (select moderation_status::text from public.mic_credits where name = 'kys comedy hour'),
  'pending',
  'a credit carrying a banned term is held for a moderator, like any other free text'
);

-- One host per series. The series-level row has a null occurrence_id, and
-- without NULLS NOT DISTINCT every null would count as a separate key.
select throws_ok(
  $$insert into public.mic_credits (series_id, role, name, created_by)
    values ('20000000-0000-4000-c000-000000000001', 'host', 'Second Host',
            '00000000-0000-4000-a000-000000000002')$$,
  '23505', null,
  'a series cannot collect two hosts'
);

-- A night override is a different row, not a conflict.
insert into public.mic_credits (series_id, occurrence_id, role, name, created_by)
select '20000000-0000-4000-c000-000000000001', o.id, 'host', 'Guest Host',
       '00000000-0000-4000-a000-000000000002'
  from public.mic_occurrences o
 where o.series_id = '20000000-0000-4000-c000-000000000001'
 order by o.starts_at limit 1;

select is(
  (select count(*)::int from public.mic_credits
    where series_id = '20000000-0000-4000-c000-000000000001' and role = 'host'),
  2,
  'one night can override the host without displacing the series default'
);

-- ---------------------------------------------------------------------------
-- Someone else's series
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.mic_credits (series_id, role, name, created_by)
    values ('20000000-0000-4000-c000-000000000009', 'featured', 'Uninvited',
            '00000000-0000-4000-a000-000000000001')$$,
  '42501', null,
  'a performer cannot add a credit to a mic they do not run'
);

-- The held credit, not the approved one: an approved credit is public by
-- design, so it proves nothing about who may see what.
select is(
  (select count(*)::int from public.mic_credits where name = 'kys comedy hour'),
  0,
  'a credit held for moderation is invisible to everyone but its producer and an admin'
);

-- ---------------------------------------------------------------------------
-- What readers see, once approved
-- ---------------------------------------------------------------------------
reset role;
update public.mic_credits set moderation_status = 'approved'
 where series_id = '20000000-0000-4000-c000-000000000001';

-- Link a credit to a real account, which is the whole point of profile_id:
-- the name and the links come from the profile and stay current.
update public.profiles
   set link_instagram = 'demo_perf_ig', link_spotify = 'https://open.spotify.com/artist/demo'
 where id = '00000000-0000-4000-a000-000000000001';

insert into public.mic_credits (series_id, role, profile_id, moderation_status, created_by)
values ('20000000-0000-4000-c000-000000000001', 'featured',
        '00000000-0000-4000-a000-000000000001', 'approved',
        '00000000-0000-4000-a000-000000000002');

set local role anon;
select set_config('request.jwt.claims', '', true);

select cmp_ok(
  (select count(*)::int from public.mic_credit_public
    where series_id = '20000000-0000-4000-c000-000000000001'), '>=', 3,
  'anonymous readers see the credits on an approved mic'
);

select is(
  (select name from public.mic_credit_public
    where series_id = '20000000-0000-4000-c000-000000000001'
      and role = 'host' and occurrence_id is null),
  'Marla Quinn',
  'a typed credit shows the typed name'
);

select is(
  (select link_spotify from public.mic_credit_public
    where series_id = '20000000-0000-4000-c000-000000000001'
      and role = 'host' and occurrence_id is null),
  'https://open.spotify.com/artist/marla',
  'and its typed links'
);

select is(
  (select link_instagram from public.mic_credit_public
    where role = 'featured'
      and profile_id = '00000000-0000-4000-a000-000000000001'),
  'demo_perf_ig',
  'a linked credit resolves its links from the profile, so they stay current'
);

select isnt(
  (select name from public.mic_credit_public
    where role = 'featured'
      and profile_id = '00000000-0000-4000-a000-000000000001'),
  null,
  'a linked credit gets its name from the profile without one being typed'
);

select is(
  (select count(*)::int from public.mic_credit_public where name = 'Uninvited'),
  0,
  'a credit that was never allowed to be written is not readable either'
);

-- Writing is producers only, whatever a reader tries.
select throws_ok(
  $$insert into public.mic_credits (series_id, role, name)
    values ('20000000-0000-4000-c000-000000000001', 'featured', 'Anon Edit')$$,
  '42501', null,
  'anonymous readers cannot add credits'
);

-- ---------------------------------------------------------------------------
-- Being credited without consent is reportable and actionable
-- (20260807000800 and 20260807000900, audit finding F-011).
--
-- profile_id points at any profile and the insert policy asks only that the
-- caller own the series, so a producer can advertise anyone in the app as
-- their host or feature, complete with avatar and socials, and the person is
-- never told. That is the association the EULA calls impersonation. It has to
-- be reportable as itself, not only as a complaint about the whole listing.
-- ---------------------------------------------------------------------------
reset role;

-- The credit linking p1 to p2's series, created above. Reused rather than
-- inserted afresh: mic_credits_one_per_role allows exactly one featured
-- credit per series, and that row is already the scenario at issue, an
-- account advertised on someone else's listing without being asked.
create temp table credited as
  select id from public.mic_credits
   where series_id = '20000000-0000-4000-c000-000000000001'
     and role = 'featured'
     and occurrence_id is null
     and profile_id = '00000000-0000-4000-a000-000000000001';
grant select on credited to anon, authenticated;

select is(
  (select count(*)::int from credited),
  1,
  'the fixture really is one account credited on another producer'
);
select ok(
  exists (select 1 from public.mic_credit_public where id = (select id from credited)),
  'an approved credit is public, which is what makes the consent question real'
);

-- p1 reports the credit that names them.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select lives_ok(
  format(
    $$insert into public.reports (reporter_id, target_type, target_id, reason, details)
      values ('00000000-0000-4000-a000-000000000001', 'credit', %L, 'impersonation',
              'I am not playing this mic')$$,
    (select id from credited)),
  'the person named in a credit can report that credit as itself'
);

-- A non-admin still cannot action it.
select throws_ok(
  format($$select moderate_content('credit', %L, false)$$, (select id from credited)),
  '42501', null,
  'and cannot moderate it themselves'
);

-- The admin can, and rejecting it takes the person off the listing.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select lives_ok(
  format($$select moderate_content('credit', %L, false)$$, (select id from credited)),
  'an admin can action a reported credit, which moderate_content used to refuse'
);

reset role;
select is(
  (select moderation_status::text from public.mic_credits
    where id = (select id from credited)),
  'rejected',
  'the credit is rejected'
);
select is_empty(
  $$ select id from public.mic_credit_public
      where id = (select id from credited) $$,
  'and it stops being advertised, so the listing falls back to a typed name'
);

select * from finish();
rollback;
