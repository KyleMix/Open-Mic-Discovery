-- Production reviewer seed: content only, no credentials.
--
-- Why this exists separately from supabase/seed.sql: that file creates auth
-- users directly with a password that is published in REVIEW_NOTES.md, and
-- puts two accounts on the admin allowlist. Its own header says never run it
-- against production, and it means it. But a store reviewer opening the app
-- against an empty production database sees an empty map, which fails
-- Guideline 2.1 on its own. So production needs the content without the
-- credentials.
--
-- The split this file makes:
--
--   Accounts are yours.  You create the two reviewer accounts by signing up
--                        through the real app, with passwords you choose and
--                        that live only in App Store Connect's review notes
--                        and your password manager. GoTrue writes its own
--                        internal columns, so there is no hand-built auth row
--                        to get subtly wrong.
--   Content is this.     Venues and listings, owned by the reviewer producer
--                        account, moderation approved, with the occurrence
--                        generator firing from the series insert trigger the
--                        same way a real listing does.
--   Admin is neither.    This file never touches admin.admin_users or
--                        profiles.is_admin. Moderator access is granted by
--                        admin_invite, per docs/admin/RUNBOOK.md, so the
--                        allowlist has exactly one origin story.
--
-- Before running, do this in the app against the production build:
--
--   1. Sign up as the reviewer performer, accept the EULA, finish onboarding
--      (handle, name, birth year, home area), and choose the performer role.
--   2. Sign up as the reviewer producer the same way, choosing the producer
--      role.
--   3. Note both email addresses.
--
-- Then run this file with those addresses, from the repo root:
--
--   psql "$PRODUCTION_DATABASE_URL" \
--     -v performer_email="'reviewer.performer@stonedgooseproductions.com'" \
--     -v producer_email="'reviewer.producer@stonedgooseproductions.com'" \
--     -f supabase/seed/production-reviewer-seed.sql
--
-- (The quoting is psql's: the value must arrive as a SQL string literal.)
--
-- Idempotent: running it twice changes nothing the second time. Safe to
-- re-run after adding content by hand.
--
-- Uuid namespace is deliberately distinct from supabase/seed.sql (prefix
-- 5eed... instead of 1000.../2000...), so that if both ever land in one
-- database, nothing collides and it is obvious which rows came from where.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- 0. Resolve the two accounts, and refuse to guess.
--
-- A missing account is a stop, not a warning: the rest of this file would
-- otherwise insert listings owned by nobody, which is exactly the "unclaimed
-- community listing" state and not what a reviewer should be shown.
-- ---------------------------------------------------------------------------
-- The lookup happens in plain SQL, not inside the DO block below: psql
-- substitutes :variables in the input stream but deliberately leaves them
-- alone inside dollar-quoted bodies, so a :performer_email written in there
-- would reach the server as literal text and fail at parse time.
create temp table reviewer_ids on commit drop as
select
  (select p.id from public.profiles p join auth.users u on u.id = p.id
    where u.email = :performer_email and p.deleted_at is null) as performer_id,
  (select p.id from public.profiles p join auth.users u on u.id = p.id
    where u.email = :producer_email and p.deleted_at is null) as producer_id,
  :performer_email::text as performer_email,
  :producer_email::text as producer_email;

do $$
declare
  r record;
begin
  select * into r from reviewer_ids;
  if r.performer_id is null then
    raise exception
      'No profile for %. Sign that account up through the app and finish '
      'onboarding first: this file seeds content, not accounts.',
      r.performer_email;
  end if;
  if r.producer_id is null then
    raise exception
      'No profile for %. Sign that account up through the app and finish '
      'onboarding first: this file seeds content, not accounts.',
      r.producer_email;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Roles, in case onboarding was clicked through differently
--
-- Onboarding already sets these when the role is chosen; this makes the
-- outcome independent of which buttons got pressed, so a reviewer never lands
-- on a producer account with no My Mics tab content.
-- ---------------------------------------------------------------------------
update public.profiles p
   set is_performer = true
  from reviewer_ids r
 where p.id = r.performer_id and p.is_performer is distinct from true;

update public.profiles p
   set is_producer = true
  from reviewer_ids r
 where p.id = r.producer_id and p.is_producer is distinct from true;

insert into public.performer_profiles (profile_id, disciplines, experience, tags)
select r.performer_id, '{music,comedy}', 'experienced', '{songwriter,storyteller}'
  from reviewer_ids r
on conflict (profile_id) do nothing;

-- No contact_phone: the reviewer producer is a demonstration account, and a
-- phone number on it would be a fake contact detail on a public listing.
insert into public.producer_profiles (profile_id, contact_email, verified)
select r.producer_id, r.producer_email, false
  from reviewer_ids r
on conflict (profile_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Venues. PostGIS points are (longitude latitude).
--
-- Seattle and Olympia, because the app's cold-start fallback centers on
-- Seattle (src/features/discovery/center.ts) and a reviewer with location
-- denied must still see a populated map.
-- ---------------------------------------------------------------------------
insert into public.venues (id, name, address_line, neighborhood, city, region, location,
                           age_restriction, wheelchair_accessible, has_pa, has_stage,
                           parking_notes, moderation_status) values
  ('5eed0000-0000-4000-b000-000000000001', 'The Rusty Fret', '1414 E Olive Way', 'Capitol Hill', 'Seattle', 'WA', 'POINT(-122.3266 47.6174)', 'twenty_one_plus', true,  true,  true,  'Street parking, arrive early on weekends', 'approved'),
  ('5eed0000-0000-4000-b000-000000000002', 'Blue Heron Coffee', '7012 Greenwood Ave N', 'Phinney Ridge', 'Seattle', 'WA', 'POINT(-122.3555 47.6797)', 'all_ages', true,  true,  false, 'Small lot behind the building', 'approved'),
  ('5eed0000-0000-4000-b000-000000000003', 'The Basement Room', '2218 NW Market St', 'Ballard', 'Seattle', 'WA', 'POINT(-122.3860 47.6687)', 'twenty_one_plus', false, true,  true,  'Paid lots on Market St', 'approved'),
  ('5eed0000-0000-4000-b000-000000000004', 'Pioneer Tavern', '166 S Washington St', 'Pioneer Square', 'Seattle', 'WA', 'POINT(-122.3324 47.6003)', 'twenty_one_plus', true,  true,  true,  null, 'approved'),
  ('5eed0000-0000-4000-b000-000000000005', 'Wildflower Books', '4214 University Way NE', 'University District', 'Seattle', 'WA', 'POINT(-122.3132 47.6588)', 'all_ages', true,  false, false, 'Bus lines 45 and 49 stop out front', 'approved'),
  ('5eed0000-0000-4000-b000-000000000006', 'The Velvet Antler', '912 E Pike St', 'Capitol Hill', 'Seattle', 'WA', 'POINT(-122.3195 47.6139)', 'twenty_one_plus', true,  true,  true,  null, 'approved'),
  ('5eed0000-0000-4000-b000-000000000007', 'The Junction House', '4515 California Ave SW', 'West Seattle', 'Seattle', 'WA', 'POINT(-122.3869 47.5615)', 'eighteen_plus', true, true, true, 'Angle parking on California Ave', 'approved'),
  ('5eed0000-0000-4000-b000-000000000008', 'Fourth Ave Collective', '416 4th Ave E', 'Downtown', 'Olympia', 'WA', 'POINT(-122.8980 47.0453)', 'all_ages', true, true, true, null, 'approved')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Listings: ten across music, comedy, and poetry.
--
-- Four are owned by the reviewer producer, so the My Mics tab and the whole
-- producer side (edit, confirm, pause, run the night) have something real to
-- act on. The rest are unclaimed community listings, which is the ordinary
-- state of most listings and is what the claim flow needs in order to be
-- demonstrable.
--
-- All four signup methods appear, because a reviewer poking at signup should
-- be able to reach a first-come list, a lottery, a paid reserved slot, and a
-- host-booked room without hunting.
--
-- anchor_date sits in the past on purpose: the occurrence generator walks the
-- rrule forward from it across a rolling 90-day window, so listings have
-- nights tonight and next month regardless of when this is run.
-- ---------------------------------------------------------------------------
insert into public.mic_series (id, venue_id, created_by, owner_id, title, disciplines, description,
                               rrule, anchor_date, start_time, doors_offset, timezone,
                               signup_method, signup_opens, signup_closes, set_length_minutes,
                               cost_cents, cost_note, capacity, last_confirmed_at,
                               last_confirmed_by, moderation_status)
select v.* from reviewer_ids r cross join lateral (values
  -- Music, owned by the reviewer producer
  ('5eed0000-0000-4000-c000-000000000001'::uuid, '5eed0000-0000-4000-b000-000000000001'::uuid,
   r.producer_id, r.producer_id,
   'Rusty Fret Open Mic', '{music}'::discipline[],
   'Long-running songwriter night. Two songs or ten minutes, whichever is shorter. House guitar and keys available.',
   'FREQ=WEEKLY;BYDAY=TU', '2026-01-06'::date, '20:00'::time, '30 minutes'::interval, 'America/Los_Angeles',
   'first_come'::signup_method, '7 days'::interval, '0'::interval, 10::smallint, 0, null, 20::smallint,
   now() - interval '2 days', r.producer_id, 'approved'::moderation_status),

  ('5eed0000-0000-4000-c000-000000000002'::uuid, '5eed0000-0000-4000-b000-000000000003'::uuid,
   r.producer_id, r.producer_id,
   'Basement Sessions', '{music}'::discipline[],
   'Full backline provided. Loud is fine. Lottery drawn at 8 sharp.',
   'FREQ=WEEKLY;BYDAY=MO', '2026-01-05'::date, '20:30'::time, '30 minutes'::interval, 'America/Los_Angeles',
   'lottery'::signup_method, '3 days'::interval, '30 minutes'::interval, 12::smallint, 0, null, 16::smallint,
   now() - interval '4 days', r.producer_id, 'approved'::moderation_status),

  -- Comedy, owned by the reviewer producer
  ('5eed0000-0000-4000-c000-000000000003'::uuid, '5eed0000-0000-4000-b000-000000000006'::uuid,
   r.producer_id, r.producer_id,
   'Velvet Antler Comedy Night', '{comedy}'::discipline[],
   'Five minutes each, hard light at four. New material encouraged. Room seats sixty and fills up.',
   'FREQ=WEEKLY;BYDAY=WE', '2026-01-07'::date, '20:00'::time, '30 minutes'::interval, 'America/Los_Angeles',
   'lottery'::signup_method, '2 days'::interval, '1 hour'::interval, 5::smallint, 0, null, 24::smallint,
   now() - interval '1 day', r.producer_id, 'approved'::moderation_status),

  -- Poetry, owned by the reviewer producer, paid reserved slot
  ('5eed0000-0000-4000-c000-000000000004'::uuid, '5eed0000-0000-4000-b000-000000000005'::uuid,
   r.producer_id, r.producer_id,
   'Wildflower Reading Series', '{poetry}'::discipline[],
   'In-the-round reading, three poets at a time. Original work only. Bookstore stays open late for it.',
   'FREQ=MONTHLY;BYDAY=1FR', '2026-01-02'::date, '19:30'::time, '30 minutes'::interval, 'America/Los_Angeles',
   'reserved_slot'::signup_method, '14 days'::interval, '1 day'::interval, 15::smallint, 500,
   'Five dollar cover paid at the door supports the sound tech', 9::smallint,
   now() - interval '9 days', r.producer_id, 'approved'::moderation_status),

  -- Unclaimed community listings
  ('5eed0000-0000-4000-c000-000000000005'::uuid, '5eed0000-0000-4000-b000-000000000002'::uuid,
   r.producer_id, null,
   'Blue Heron Acoustic Night', '{music}'::discipline[],
   'All ages coffeehouse mic. Unplugged only, no drums. Sign up at the counter or in the app.',
   'FREQ=WEEKLY;BYDAY=TH', '2026-01-08'::date, '18:30'::time, '0'::interval, 'America/Los_Angeles',
   'first_come'::signup_method, '5 days'::interval, '0'::interval, 8::smallint, 0, null, 14::smallint,
   now() - interval '12 days', null, 'approved'::moderation_status),

  ('5eed0000-0000-4000-c000-000000000006'::uuid, '5eed0000-0000-4000-b000-000000000004'::uuid,
   r.producer_id, null,
   'Pioneer Square Stand Up', '{comedy}'::discipline[],
   'Old tavern room, low ceiling, forgiving crowd. Good first stage for a new five.',
   'FREQ=WEEKLY;BYDAY=SU', '2026-01-04'::date, '19:00'::time, '30 minutes'::interval, 'America/Los_Angeles',
   'first_come'::signup_method, '7 days'::interval, '0'::interval, 5::smallint, 0, null, 18::smallint,
   now() - interval '20 days', null, 'approved'::moderation_status),

  ('5eed0000-0000-4000-c000-000000000007'::uuid, '5eed0000-0000-4000-b000-000000000007'::uuid,
   r.producer_id, null,
   'Junction House Mixed Mic', '{music,comedy,poetry}'::discipline[],
   'Anything goes: songs, jokes, poems, the occasional magic trick. Ten minute slots.',
   'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH', '2026-01-08'::date, '19:30'::time, '30 minutes'::interval, 'America/Los_Angeles',
   'first_come'::signup_method, '7 days'::interval, '0'::interval, 10::smallint, 0, null, 15::smallint,
   now() - interval '35 days', null, 'approved'::moderation_status),

  ('5eed0000-0000-4000-c000-000000000008'::uuid, '5eed0000-0000-4000-b000-000000000008'::uuid,
   r.producer_id, null,
   'Fourth Ave Poetry Circle', '{poetry}'::discipline[],
   'Quiet room, attentive listeners, no time limit within reason. Olympia regulars and visitors both welcome.',
   'FREQ=WEEKLY;BYDAY=TU', '2026-01-06'::date, '18:00'::time, '0'::interval, 'America/Los_Angeles',
   'first_come'::signup_method, '7 days'::interval, '0'::interval, 8::smallint, 0, null, 12::smallint,
   now() - interval '6 days', null, 'approved'::moderation_status),

  ('5eed0000-0000-4000-c000-000000000009'::uuid, '5eed0000-0000-4000-b000-000000000001'::uuid,
   r.producer_id, null,
   'Rusty Fret Comedy Showcase', '{comedy}'::discipline[],
   'Booked show with two open spots held back for drop-ins. Ask the host on the night.',
   'FREQ=MONTHLY;BYDAY=3SA', '2026-01-17'::date, '21:00'::time, '1 hour'::interval, 'America/Los_Angeles',
   'host_booked'::signup_method, '30 days'::interval, '2 days'::interval, 8::smallint, 1000,
   'Ten dollars at the door, performers free', 12::smallint,
   now() - interval '48 days', null, 'approved'::moderation_status),

  -- One deliberately stale listing, so the freshness badge has something to
  -- say and the "something wrong with this listing" flow has a plausible
  -- target. Nothing about it is broken; it simply has not been confirmed.
  ('5eed0000-0000-4000-c000-000000000010'::uuid, '5eed0000-0000-4000-b000-000000000005'::uuid,
   r.producer_id, null,
   'University Way Songwriters', '{music}'::discipline[],
   'Student-run mic in the back room. Term-time only, so check before travelling.',
   'FREQ=WEEKLY;BYDAY=FR', '2026-01-09'::date, '19:00'::time, '0'::interval, 'America/Los_Angeles',
   'first_come'::signup_method, '7 days'::interval, '0'::interval, 10::smallint, 0, null, 10::smallint,
   now() - interval '75 days', null, 'approved'::moderation_status)
) as v
on conflict (id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- What to check before handing the build to a reviewer
--
--   select count(*) from mic_series where id::text like '5eed%';      -- 10
--   select count(*) from mic_occurrences o join mic_series s on s.id = o.series_id
--    where s.id::text like '5eed%' and o.starts_at > now();           -- many
--
-- If the occurrence count is zero, the generator has not run: check that
-- private.generate_occurrences() is scheduled (pg_cron) and run it once by
-- hand. The nights are what a reviewer actually sees, not the series rows.
-- ---------------------------------------------------------------------------
