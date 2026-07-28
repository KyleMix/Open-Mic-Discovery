-- Local development and review seed.
-- Runs as postgres (bypasses RLS). Never run against production.
--
-- Creates: 4 demo auth users (performer, producer, dual-role, admin),
-- 18 venues, and 20 mic series across music, comedy, and poetry in the
-- Pacific Northwest. Occurrence generation fires automatically via the
-- series insert trigger.
--
-- Demo credentials are documented in REVIEW_NOTES.md.

-- ---------------------------------------------------------------------------
-- Demo auth users. Password for all: demo-pass-1234
-- ---------------------------------------------------------------------------
-- GoTrue requires the internal token columns to be empty strings, not NULL:
-- its Go scanner returns HTTP 500 on login for any user where they are NULL.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token,
   reauthentication_token)
values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'performer@demo.openmic.local',
   crypt('demo-pass-1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'producer@demo.openmic.local',
   crypt('demo-pass-1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-4000-a000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dual@demo.openmic.local',
   crypt('demo-pass-1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-4000-a000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@demo.openmic.local',
   crypt('demo-pass-1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  -- Owner/tester account: performer + producer + admin in one login.
  ('00000000-0000-4000-a000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'kylewmixon@gmail.com',
   crypt('openmic-tester-2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');

insert into auth.identities
  (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email like '%@demo.openmic.local' or u.email = 'kylewmixon@gmail.com';

insert into profiles (id, handle, display_name, bio, home_city, home_region, home_lat, home_lng,
                      birth_year, is_performer, is_producer, is_admin, eula_version, moderation_status)
values
  ('00000000-0000-4000-a000-000000000001', 'demo_performer', 'Demi Performer',
   'Acoustic sets and the occasional poem.', 'Seattle', 'WA', 47.6062, -122.3321,
   1994, true, false, false, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000002', 'demo_producer', 'Pat Producer',
   'I run rooms around Capitol Hill.', 'Seattle', 'WA', 47.6062, -122.3321,
   1987, false, true, false, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000003', 'demo_dual', 'Dana Dual',
   'Comic who also hosts a weekly.', 'Portland', 'OR', 45.5152, -122.6784,
   1991, true, true, false, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000004', 'demo_admin', 'Alex Admin',
   'Keeping listings fresh.', 'Seattle', 'WA', 47.6062, -122.3321,
   1985, false, false, true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000005', 'kyle', 'Kyle',
   'Building Open Mic Finder.', 'Seattle', 'WA', 47.6062, -122.3321,
   1990, true, true, true, '1.0', 'approved');

-- Social links on a couple of demo profiles so the profile screens have
-- something to render.
update profiles
set link_instagram = 'demi.performer',
    link_website = 'https://demiperformer.example.com'
where id = '00000000-0000-4000-a000-000000000001';
update profiles
set link_instagram = 'openmicfinder',
    link_youtube = 'https://youtube.com/@openmicfinder'
where id = '00000000-0000-4000-a000-000000000005';

insert into performer_profiles (profile_id, disciplines, experience, tags) values
  ('00000000-0000-4000-a000-000000000001', '{music,poetry}', 'developing', '{acoustic,folk}'),
  ('00000000-0000-4000-a000-000000000003', '{comedy}', 'experienced', '{observational}'),
  ('00000000-0000-4000-a000-000000000005', '{music,comedy,poetry}', 'experienced', '{}');

insert into producer_profiles (profile_id, contact_email, contact_phone, verified) values
  ('00000000-0000-4000-a000-000000000002', 'pat@demo.openmic.local', '+12065550142', true),
  ('00000000-0000-4000-a000-000000000003', 'dana@demo.openmic.local', null, false),
  ('00000000-0000-4000-a000-000000000005', 'kylewmixon@gmail.com', null, true);

-- ---------------------------------------------------------------------------
-- Venues. PostGIS points are (longitude latitude).
-- ---------------------------------------------------------------------------
insert into venues (id, name, address_line, neighborhood, city, region, location,
                    age_restriction, wheelchair_accessible, has_pa, has_stage,
                    parking_notes, moderation_status) values
  ('10000000-0000-4000-b000-000000000001', 'The Rusty Fret', '1414 E Olive Way', 'Capitol Hill', 'Seattle', 'WA', 'POINT(-122.3266 47.6174)', 'twenty_one_plus', true,  true,  true,  'Street parking, arrive early on weekends', 'approved'),
  ('10000000-0000-4000-b000-000000000002', 'Blue Heron Coffee', '7012 Greenwood Ave N', 'Phinney Ridge', 'Seattle', 'WA', 'POINT(-122.3555 47.6797)', 'all_ages', true,  true,  false, 'Small lot behind the building', 'approved'),
  ('10000000-0000-4000-b000-000000000003', 'The Basement Room', '2218 NW Market St', 'Ballard', 'Seattle', 'WA', 'POINT(-122.3860 47.6687)', 'twenty_one_plus', false, true,  true,  'Paid lots on Market St', 'approved'),
  ('10000000-0000-4000-b000-000000000004', 'Pioneer Tavern', '166 S Washington St', 'Pioneer Square', 'Seattle', 'WA', 'POINT(-122.3324 47.6003)', 'twenty_one_plus', true,  true,  true,  null, 'approved'),
  ('10000000-0000-4000-b000-000000000005', 'Wildflower Books', '4214 University Way NE', 'University District', 'Seattle', 'WA', 'POINT(-122.3132 47.6588)', 'all_ages', true,  false, false, 'Bus lines 45 and 49 stop out front', 'approved'),
  ('10000000-0000-4000-b000-000000000006', 'The Velvet Antler', '912 E Pike St', 'Capitol Hill', 'Seattle', 'WA', 'POINT(-122.3195 47.6139)', 'twenty_one_plus', true,  true,  true,  null, 'approved'),
  ('10000000-0000-4000-b000-000000000007', 'Duwamish Hall', '4408 Delridge Way SW', 'Delridge', 'Seattle', 'WA', 'POINT(-122.3625 47.5646)', 'all_ages', true,  true,  true,  'Free lot', 'approved'),
  ('10000000-0000-4000-b000-000000000008', 'North End Taproom', '8004 Aurora Ave N', 'Green Lake', 'Seattle', 'WA', 'POINT(-122.3441 47.6883)', 'twenty_one_plus', true,  true,  false, null, 'approved'),
  ('10000000-0000-4000-b000-000000000009', 'The Junction House', '4515 California Ave SW', 'West Seattle', 'Seattle', 'WA', 'POINT(-122.3869 47.5615)', 'eighteen_plus', true,  true,  true,  'Angle parking on California Ave', 'approved'),
  ('10000000-0000-4000-b000-000000000010', 'Cedar and Salt', '117 Tacoma Ave S', 'Downtown', 'Tacoma', 'WA', 'POINT(-122.4400 47.2529)', 'twenty_one_plus', true,  true,  true,  null, 'approved'),
  ('10000000-0000-4000-b000-000000000011', 'The Spar Annex', '2121 N 30th St', 'Old Town', 'Tacoma', 'WA', 'POINT(-122.4576 47.2707)', 'all_ages', false, true,  false, 'Street parking on 30th', 'approved'),
  ('10000000-0000-4000-b000-000000000012', 'Burnside Social Club', '722 E Burnside St', 'Central Eastside', 'Portland', 'OR', 'POINT(-122.6584 45.5230)', 'twenty_one_plus', true,  true,  true,  null, 'approved'),
  ('10000000-0000-4000-b000-000000000013', 'Hawthorne Reading Room', '3524 SE Hawthorne Blvd', 'Hawthorne', 'Portland', 'OR', 'POINT(-122.6270 45.5121)', 'all_ages', true,  false, false, null, 'approved'),
  ('10000000-0000-4000-b000-000000000014', 'The Alberta Cellar', '1829 NE Alberta St', 'Alberta Arts', 'Portland', 'OR', 'POINT(-122.6469 45.5589)', 'twenty_one_plus', false, true,  true,  'Bike racks out front, car parking is rough', 'approved'),
  ('10000000-0000-4000-b000-000000000015', 'St Johns Lodge', '8203 N Ivanhoe St', 'St Johns', 'Portland', 'OR', 'POINT(-122.7546 45.5898)', 'twenty_one_plus', true,  true,  true,  'Free street parking', 'approved'),
  ('10000000-0000-4000-b000-000000000016', 'Fourth Ave Collective', '416 4th Ave E', 'Downtown', 'Olympia', 'WA', 'POINT(-122.8980 47.0453)', 'all_ages', true,  true,  true,  null, 'approved'),
  ('10000000-0000-4000-b000-000000000017', 'The Bayside Anchor', '1212 N State St', 'Downtown', 'Bellingham', 'WA', 'POINT(-122.4787 48.7519)', 'twenty_one_plus', true,  true,  false, null, 'approved'),
  ('10000000-0000-4000-b000-000000000018', 'Riverfront Grange', '1114 Main St', 'Downtown', 'Vancouver', 'WA', 'POINT(-122.6720 45.6280)', 'all_ages', true,  true,  true,  'Lot across Main St', 'approved');

-- ---------------------------------------------------------------------------
-- Mic series: 20 across music (8), comedy (7), poetry (4), mixed (1).
-- Producer demo user owns four Seattle rooms; dual-role demo owns one in
-- Portland; the rest are unclaimed (community-entered by the admin).
-- p2 = demo_producer, p3 = demo_dual, p4 = demo_admin (creator of seeds).
-- ---------------------------------------------------------------------------
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, description,
                        rrule, anchor_date, start_time, doors_offset, timezone,
                        signup_method, signup_opens, signup_closes, set_length_minutes,
                        cost_cents, cost_note, capacity, last_confirmed_at, last_confirmed_by,
                        moderation_status) values
-- Music
  ('20000000-0000-4000-c000-000000000001', '10000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'Rusty Fret Open Mic', '{music}', 'Long-running songwriter night. Two songs or ten minutes, whichever is shorter. House guitar and keys available.',
   'FREQ=WEEKLY;BYDAY=TU', '2026-01-06', '20:00', '30 minutes', 'America/Los_Angeles',
   'first_come', '7 days', '0', 10, 0, null, 20, now() - interval '2 days',
   '00000000-0000-4000-a000-000000000002', 'approved'),
  ('20000000-0000-4000-c000-000000000002', '10000000-0000-4000-b000-000000000002',
   '00000000-0000-4000-a000-000000000004', null,
   'Blue Heron Acoustic Night', '{music}', 'All ages coffeehouse mic. Unplugged only, no drums. Sign up at the counter or in the app.',
   'FREQ=WEEKLY;BYDAY=TH', '2026-01-08', '18:30', '0', 'America/Los_Angeles',
   'first_come', '5 days', '0', 8, 0, null, 14, now() - interval '12 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000003', '10000000-0000-4000-b000-000000000003',
   '00000000-0000-4000-a000-000000000004', null,
   'Basement Sessions', '{music}', 'Full backline provided. Loud is fine. Lottery drawn at 8 sharp.',
   'FREQ=WEEKLY;BYDAY=MO', '2026-01-05', '20:30', '30 minutes', 'America/Los_Angeles',
   'lottery', '3 days', '30 minutes', 12, 0, null, 16, now() - interval '40 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000004', '10000000-0000-4000-b000-000000000008',
   '00000000-0000-4000-a000-000000000004', null,
   'Taproom Tunes', '{music}', 'Casual taproom mic, mostly regulars, very welcoming to first-timers.',
   'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE', '2026-01-07', '19:00', '0', 'America/Los_Angeles',
   'first_come', '7 days', '0', 10, 0, null, 12, now() - interval '5 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000005', '10000000-0000-4000-b000-000000000010',
   '00000000-0000-4000-a000-000000000004', null,
   'Cedar and Salt Songwriter Circle', '{music}', 'In-the-round format, three writers at a time. Original material only.',
   'FREQ=MONTHLY;BYDAY=1FR', '2026-01-02', '19:30', '30 minutes', 'America/Los_Angeles',
   'reserved_slot', '14 days', '1 day', 15, 500, 'Five dollar cover supports the sound tech', 9, now() - interval '20 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000006', '10000000-0000-4000-b000-000000000015',
   '00000000-0000-4000-a000-000000000004', null,
   'St Johns Stage Night', '{music}', 'Neighborhood lodge mic with a proper stage and a kind crowd.',
   'FREQ=WEEKLY;BYDAY=SU', '2026-01-04', '18:00', '30 minutes', 'America/Los_Angeles',
   'first_come', '7 days', '0', 10, 0, null, 18, now() - interval '9 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000007', '10000000-0000-4000-b000-000000000017',
   '00000000-0000-4000-a000-000000000004', null,
   'Bayside Open Strings', '{music}', 'Folk-leaning mic near the waterfront. House PA, bring your own instrument.',
   'FREQ=WEEKLY;BYDAY=WE', '2026-01-07', '19:00', '0', 'America/Los_Angeles',
   'first_come', '7 days', '0', 10, 0, null, 15, now() - interval '65 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000008', '10000000-0000-4000-b000-000000000018',
   '00000000-0000-4000-a000-000000000004', null,
   'Riverfront Roots Night', '{music}', 'All ages roots and Americana mic at the old grange hall.',
   'FREQ=MONTHLY;BYDAY=2SA', '2026-01-10', '19:00', '30 minutes', 'America/Los_Angeles',
   'host_booked', '30 days', '0', 12, 0, null, 10, now() - interval '15 days', null, 'approved'),
-- Comedy
  ('20000000-0000-4000-c000-000000000009', '10000000-0000-4000-b000-000000000006',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'Velvet Antler Comedy Open Mic', '{comedy}', 'The Hill''s busiest comedy mic. Four minutes, bright light at three thirty. List drops in the app.',
   'FREQ=WEEKLY;BYDAY=WE', '2026-01-07', '21:00', '30 minutes', 'America/Los_Angeles',
   'first_come', '2 days', '2 hours', 4, 0, null, 25, now() - interval '1 day',
   '00000000-0000-4000-a000-000000000002', 'approved'),
  ('20000000-0000-4000-c000-000000000010', '10000000-0000-4000-b000-000000000004',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'Pioneer Tavern Punchlines', '{comedy}', 'Lottery mic in the back room. Names in the bucket by 7:45, drawn at 8.',
   'FREQ=WEEKLY;BYDAY=TH', '2026-01-08', '20:00', '15 minutes', 'America/Los_Angeles',
   'lottery', '1 day', '15 minutes', 5, 0, null, 20, now() - interval '3 days',
   '00000000-0000-4000-a000-000000000002', 'approved'),
  ('20000000-0000-4000-c000-000000000011', '10000000-0000-4000-b000-000000000009',
   '00000000-0000-4000-a000-000000000004', null,
   'Junction Laughs', '{comedy}', 'West Seattle''s only weekly comedy mic. Five minutes for newcomers, features for regulars.',
   'FREQ=WEEKLY;BYDAY=MO', '2026-01-05', '20:00', '30 minutes', 'America/Los_Angeles',
   'first_come', '4 days', '1 hour', 5, 0, null, 18, now() - interval '8 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000012', '10000000-0000-4000-b000-000000000012',
   '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000003',
   'Burnside Comedy Lab', '{comedy}', 'Workshop-friendly room. Taping encouraged, crowd work discouraged. Hosted by Dana.',
   'FREQ=WEEKLY;BYDAY=TU', '2026-01-06', '20:30', '30 minutes', 'America/Los_Angeles',
   'lottery', '2 days', '1 hour', 5, 0, null, 22, now() - interval '4 days',
   '00000000-0000-4000-a000-000000000003', 'approved'),
  ('20000000-0000-4000-c000-000000000013', '10000000-0000-4000-b000-000000000014',
   '00000000-0000-4000-a000-000000000004', null,
   'Alberta Cellar Comedy', '{comedy}', 'Basement room, low ceiling, hot crowd. Reserved slots plus walk-in standby.',
   'FREQ=WEEKLY;BYDAY=FR', '2026-01-09', '22:00', '30 minutes', 'America/Los_Angeles',
   'reserved_slot', '7 days', '3 hours', 6, 0, null, 12, now() - interval '6 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000014', '10000000-0000-4000-b000-000000000011',
   '00000000-0000-4000-a000-000000000004', null,
   'Spar Annex Standup Night', '{comedy}', 'All ages early show, keep it clean until nine.',
   'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA', '2026-01-10', '19:00', '0', 'America/Los_Angeles',
   'first_come', '7 days', '0', 5, 0, null, 15, now() - interval '30 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000015', '10000000-0000-4000-b000-000000000016',
   '00000000-0000-4000-a000-000000000004', null,
   'Fourth Ave Comedy Collective', '{comedy}', 'Olympia''s co-op comedy mic. Sign up in the app, order at the bar, tip your host.',
   'FREQ=WEEKLY;BYDAY=SU', '2026-01-04', '20:00', '30 minutes', 'America/Los_Angeles',
   'first_come', '5 days', '30 minutes', 5, 0, null, 16, now() - interval '11 days', null, 'approved'),
-- Poetry
  ('20000000-0000-4000-c000-000000000016', '10000000-0000-4000-b000-000000000005',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'Wildflower Poetry Night', '{poetry}', 'Longest-running poetry mic north of the ship canal. One poem or three minutes. Feature reader monthly.',
   'FREQ=WEEKLY;BYDAY=FR', '2026-01-09', '19:00', '0', 'America/Los_Angeles',
   'first_come', '7 days', '0', 3, 0, null, 20, now() - interval '2 days',
   '00000000-0000-4000-a000-000000000002', 'approved'),
  ('20000000-0000-4000-c000-000000000017', '10000000-0000-4000-b000-000000000013',
   '00000000-0000-4000-a000-000000000004', null,
   'Hawthorne Verse', '{poetry}', 'Reading-room mic for poems and short prose. Quiet, attentive, all ages.',
   'FREQ=MONTHLY;BYDAY=1SU,3SU', '2026-01-04', '17:00', '0', 'America/Los_Angeles',
   'first_come', '10 days', '0', 5, 0, null, 15, now() - interval '18 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000018', '10000000-0000-4000-b000-000000000007',
   '00000000-0000-4000-a000-000000000004', null,
   'Duwamish Spoken Word', '{poetry}', 'Community hall slam-adjacent night. Original work only, respect the mic.',
   'FREQ=MONTHLY;BYDAY=-1TH', '2026-01-29', '19:30', '30 minutes', 'America/Los_Angeles',
   'lottery', '14 days', '1 hour', 5, 0, null, 18, now() - interval '25 days', null, 'approved'),
  ('20000000-0000-4000-c000-000000000019', '10000000-0000-4000-b000-000000000016',
   '00000000-0000-4000-a000-000000000004', null,
   'Olympia Poetry Exchange', '{poetry}', 'Round-robin format, everyone reads, nobody headlines.',
   'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', '2026-01-06', '18:30', '0', 'America/Los_Angeles',
   'first_come', '7 days', '0', 4, 0, null, 12, now() - interval '50 days', null, 'approved'),
-- Mixed disciplines
  ('20000000-0000-4000-c000-000000000020', '10000000-0000-4000-b000-000000000007',
   '00000000-0000-4000-a000-000000000004', null,
   'Delridge Variety Mic', '{music,comedy,poetry}', 'Anything goes: songs, sets, poems, whatever you have. Eight minutes hard cap.',
   'FREQ=WEEKLY;BYDAY=SA', '2026-01-03', '19:00', '30 minutes', 'America/Los_Angeles',
   'first_come', '7 days', '0', 8, 0, null, 16, now() - interval '7 days', null, 'approved');

-- A couple of demo signups so the performer account has history to show.
insert into signups (occurrence_id, performer_id, status)
select o.id, '00000000-0000-4000-a000-000000000001', 'requested'
from mic_occurrences o
where o.series_id = '20000000-0000-4000-c000-000000000001'
  and o.starts_at > now()
order by o.starts_at
limit 1;

insert into favorites (profile_id, series_id) values
  ('00000000-0000-4000-a000-000000000001', '20000000-0000-4000-c000-000000000001'),
  ('00000000-0000-4000-a000-000000000001', '20000000-0000-4000-c000-000000000016'),
  ('00000000-0000-4000-a000-000000000003', '20000000-0000-4000-c000-000000000012');
