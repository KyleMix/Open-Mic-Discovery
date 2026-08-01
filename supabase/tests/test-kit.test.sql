-- Owner bootstrap and test kit tests.
--
-- Seeded ids used here:
--   ...0001 performer (not an admin)
--   ...0004 admin
--   ...0005 owner (kylewmixon@gmail.com): performer + producer + admin
begin;
select plan(45);

-- ---------------------------------------------------------------------------
-- Owner bootstrap
-- ---------------------------------------------------------------------------
select ok(
  (select is_admin and is_performer and is_producer and moderation_status = 'approved'
   from profiles where id = '00000000-0000-4000-a000-000000000005'),
  'the owner account holds performer, producer, and admin, already approved'
);
select ok(
  (select count(*) = 1 from performer_profiles
   where profile_id = '00000000-0000-4000-a000-000000000005'),
  'the owner has a performer profile row'
);
select ok(
  (select verified from producer_profiles
   where profile_id = '00000000-0000-4000-a000-000000000005'),
  'the owner has a verified producer profile row'
);

-- A brand new sign-up on the owner email is bootstrapped by the trigger, even
-- though the insert itself asks for none of it. This is the hosted-project
-- path: sign up in the app, land as a full admin.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token,
   reauthentication_token)
values
  ('00000000-0000-4000-a000-0000000000ff', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'KyleWMixon@gmail.com', 'x', now(),
   '{}', '{}', now(), now(), '', '', '', '', '', '', '', '');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000ff","role":"authenticated"}',
  true
);
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      birth_year, eula_version)
values ('00000000-0000-4000-a000-0000000000ff', 'owner_signup', 'Kyle', 'Kyle',
        'Seattle', 'WA', 1990,
        (select version from eula_versions order by published_at desc limit 1));
reset role;

select ok(
  (select is_admin and is_performer and is_producer
   from profiles where id = '00000000-0000-4000-a000-0000000000ff'),
  'a fresh sign-up on the owner email is promoted on insert, case-insensitively'
);
select ok(
  (select count(*) = 1 from producer_profiles
   where profile_id = '00000000-0000-4000-a000-0000000000ff'),
  'the fresh owner sign-up gets its producer row too'
);
delete from profiles where id = '00000000-0000-4000-a000-0000000000ff';
delete from auth.users where id = '00000000-0000-4000-a000-0000000000ff';

-- Everyone else is unaffected: is_admin still cannot be self-granted.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true
);
update profiles set is_admin = true where id = '00000000-0000-4000-a000-000000000001';
reset role;
select ok(
  (select not is_admin from profiles where id = '00000000-0000-4000-a000-000000000001'),
  'a non-owner still cannot self-grant admin'
);

-- ---------------------------------------------------------------------------
-- Every entry point is admin only
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select test_kit_seed_scenario('tonight')$$, '42501', null,
  'a non-admin cannot seed a scenario'
);
select throws_ok(
  $$select test_kit_status()$$, '42501', null,
  'a non-admin cannot read test kit status'
);
select throws_ok(
  $$select test_kit_reset()$$, '42501', null,
  'a non-admin cannot reset test data'
);
select throws_ok(
  $$select test_kit_set_roles(true, true)$$, '42501', null,
  'a non-admin cannot use the role switcher'
);
select throws_ok(
  $$select test_kit_set_enabled(false)$$, '42501', null,
  'a non-admin cannot touch the kill switch'
);
select throws_ok(
  format('select test_kit_fill_roster(%L, 3)', (select id from mic_occurrences limit 1)),
  '42501', null,
  'a non-admin cannot fill a roster'
);
select throws_ok(
  format('select test_kit_shift_occurrence(%L, 30)', (select id from mic_occurrences limit 1)),
  '42501', null,
  'a non-admin cannot move a night'
);
select is(
  (select count(*)::int from test_kit_objects),
  0,
  'the registry is invisible to non-admins'
);

-- ---------------------------------------------------------------------------
-- The kill switch
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}',
  true
);
select lives_ok(
  $$select test_kit_set_enabled(false)$$,
  'an admin can switch the kit off'
);
select throws_ok(
  $$select test_kit_seed_scenario('tonight')$$, '42501', null,
  'a switched-off kit refuses to seed'
);
select lives_ok(
  $$select test_kit_set_enabled(true)$$,
  'the switch is reachable again from the app, so it is not a one-way door'
);

-- ---------------------------------------------------------------------------
-- Scenarios build real data and reset removes exactly it
-- ---------------------------------------------------------------------------
-- Counted as the migration role: auth.users is not readable by API roles.
reset role;
create temp table baseline as
  select (select count(*) from mic_series) as series,
         (select count(*) from venues) as venues,
         (select count(*) from profiles) as profiles,
         (select count(*) from signups) as signups,
         (select count(*) from auth.users) as users;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}',
  true
);

select lives_ok(
  $$select test_kit_seed_scenario('tonight', 'America/Los_Angeles')$$,
  'the tonight scenario runs'
);
select ok(
  (select count(*) >= 6 from signups sg
   join mic_occurrences o on o.id = sg.occurrence_id
   join mic_series s on s.id = o.series_id
   where s.title = 'Tonight at the Test Room'),
  'tonight ships a mic with a roster already on it'
);
select ok(
  (select o.starts_at between now() and now() + interval '2 hours'
   from mic_occurrences o join mic_series s on s.id = o.series_id
   where s.title = 'Tonight at the Test Room'
   order by o.starts_at limit 1),
  'the tonight mic starts within the next two hours'
);

select lives_ok(
  $$select test_kit_seed_scenario('lottery')$$,
  'the lottery scenario runs'
);
select is(
  (select count(*)::int from signups sg
   join mic_occurrences o on o.id = sg.occurrence_id
   join mic_series s on s.id = o.series_id
   where s.title = 'Test Kit Lottery Night' and sg.status = 'requested'),
  9,
  'the lottery night has more names than slots, none drawn yet'
);

select lives_ok(
  $$select test_kit_seed_scenario('unclaimed')$$,
  'the unclaimed scenario runs'
);
select ok(
  (select owner_id is null from mic_series where title = 'Test Unclaimed Mic'),
  'the unclaimed listing really is unowned'
);

-- Moving a night is DST-correct: the local date is recomputed in the series
-- timezone, never assumed.
select lives_ok(
  format('select test_kit_shift_occurrence(%L, 15)',
    (select o.id from mic_occurrences o join mic_series s on s.id = o.series_id
     where s.title = 'Test Kit Lottery Night' order by o.starts_at limit 1)),
  'a night can be moved to fifteen minutes from now'
);
select ok(
  (select o.local_date = ((o.starts_at at time zone s.timezone)::date)
   from mic_occurrences o join mic_series s on s.id = o.series_id
   where s.title = 'Test Kit Lottery Night' order by o.starts_at limit 1),
  'the moved night keeps its local date in the series timezone'
);

select lives_ok($$select test_kit_reset()$$, 'reset runs');

reset role;
select ok(
  (select b.series = (select count(*) from mic_series)
      and b.venues = (select count(*) from venues)
      and b.profiles = (select count(*) from profiles)
      and b.signups = (select count(*) from signups)
      and b.users = (select count(*) from auth.users)
   from baseline b),
  'reset puts every table back exactly where it started'
);


-- ---------------------------------------------------------------------------
-- Reset does not strand data behind a failure it cannot control
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}',
  true
);
select lives_ok(
  $$select test_kit_seed_scenario('tonight')$$,
  'a scenario to clean up'
);

-- Stand in for the auth schema refusing the delete, which is what a hosted
-- project can do and the local shim cannot: a trigger that raises exactly
-- the way a privilege or foreign key failure would.
reset role;
create or replace function private.test_kit_block_auth_delete()
returns trigger language plpgsql as $fn$
begin
  raise exception 'permission denied for table users' using errcode = '42501';
end;
$fn$;
create trigger test_kit_block_auth_delete before delete on auth.users
  for each row execute function private.test_kit_block_auth_delete();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}',
  true
);
select ok(
  (select test_kit_reset() ? 'warning'),
  'reset reports the sign-ins it could not remove instead of failing outright'
);

reset role;
drop trigger test_kit_block_auth_delete on auth.users;
select is(
  (select count(*)::int from mic_series where title = 'Tonight at the Test Room'),
  0,
  'the test listings still went, which is what was actually asked for'
);


-- ---------------------------------------------------------------------------
-- On deck cannot outlive the set
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}',
  true
);
select lives_ok(
  $$select test_kit_seed_scenario('live')$$,
  'the live scenario runs'
);

reset role;
create temp table live_night as
  select o.id
  from mic_occurrences o join mic_series s on s.id = o.series_id
  where s.title = 'Test Kit Live Room'
  order by o.starts_at limit 1;
grant select on live_night to anon, authenticated;

select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from live_night) and status = 'performed'),
  2,
  'the live scenario starts mid-show, with sets already done'
);
select is(
  (select slot_position::int from signups
   where occurrence_id = (select id from live_night) and on_deck_at is not null),
  5,
  'on deck sits one behind whoever is on stage, not on the person walking up'
);
select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from live_night) and status = 'waitlisted'),
  2,
  'the list is full, so the last two land on the waitlist through the lifecycle'
);

-- The bug this trigger exists for: marked done while still flagged on deck.
update signups set status = 'performed'
where occurrence_id = (select id from live_night) and slot_position = 5;
select ok(
  (select on_deck_at is null from signups
   where occurrence_id = (select id from live_night) and slot_position = 5),
  'marking a performer done takes them off deck, whatever route marked them'
);

-- And the mirror still holds: it cannot be set on someone already finished.
select throws_ok(
  format('select mark_on_deck(%L)',
    (select id from signups
     where occurrence_id = (select id from live_night) and slot_position = 5)),
  '23514', null,
  'and it cannot be put back on somebody who has already been up'
);

-- ---------------------------------------------------------------------------
-- Rewinding a night
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}',
  true
);
select lives_ok(
  format('select end_show(%L)', (select id from live_night)),
  'the host ends the show'
);
select lives_ok(
  format('select test_kit_restart_night(%L)', (select id from live_night)),
  'and the night can be rewound to run again'
);

reset role;
select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from live_night)
     and status in ('performed', 'no_show')),
  0,
  'everyone who went up is back on the list'
);
select ok(
  (select live_ended_at is null from mic_occurrences where id = (select id from live_night)),
  'and the controls are open again'
);


-- ---------------------------------------------------------------------------
-- The kit reports its own version, so a stale database can say so
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}',
  true
);
select is(
  (select (test_kit_status() ->> 'kit_version')::int),
  4,
  'status carries the kit version the app checks against'
);

-- Moving a night has to undo an ended show too, or the time machine drops
-- the host straight onto "Show ended", which is the dead end it exists to
-- avoid.
select lives_ok(
  format('select end_show(%L)', (select id from live_night)),
  'a show that was ended'
);
select lives_ok(
  format('select test_kit_shift_occurrence(%L, 30)', (select id from live_night)),
  'can be moved into the live window'
);
reset role;
select ok(
  (select live_ended_at is null and starts_at > now()
   from mic_occurrences where id = (select id from live_night)),
  'and it reopens rather than staying ended'
);

select * from finish();
rollback;
