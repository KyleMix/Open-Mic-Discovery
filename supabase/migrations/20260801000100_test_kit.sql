-- Owner bootstrap and the test kit.
--
-- Two related problems this solves for the person who owns the app:
--
--   1. Owner bootstrap. Signing in with the owner email on ANY environment
--      (local, preview, hosted) lands a full account: performer, producer,
--      and admin, already approved, with the child profile rows present. No
--      SQL editor round trip after every database reset.
--
--   2. Test kit. Admin-only server functions that build whole scenarios in
--      one call: a mic starting in ninety minutes with a roster on it, a
--      lottery night waiting to be drawn, a week of listings across every
--      discipline and price, a claim waiting for review, a moderation queue
--      with real items in it. Everything the kit creates is recorded in
--      test_kit_objects, so one reset call removes exactly that and nothing
--      else.
--
-- Safety, because these functions mint sign-ins and content:
--   - Every entry point requires private.is_admin(). is_admin cannot be
--     self-granted (profiles_guard pins it), so only the bootstrapped owner
--     and accounts an admin promoted can reach any of this.
--   - A kill switch row (test_kit_settings.enabled) turns the whole kit off
--     without a code change. Flip it before store submission.
--   - Test sign-ins only ever use the reserved @openmic.test domain, so a
--     test account can never collide with a real person's email.

-- ---------------------------------------------------------------------------
-- 1. Owner bootstrap
-- ---------------------------------------------------------------------------

-- The owner allowlist. Adding an email here promotes that account on its
-- next sign-up; it never demotes anyone.
create or replace function private.owner_emails()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['kylewmixon@gmail.com']::text[];
$$;

create or replace function private.is_owner_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_email, '')) = any (private.owner_emails());
$$;

-- BEFORE INSERT, and named to sort after profiles_guard so it runs second:
-- the guard pins is_admin to false for self-serve sign-ups, and this puts it
-- back for the owner. Doing it in an AFTER trigger would not work, because
-- the follow-up UPDATE would hit the guard again.
create or replace function private.bootstrap_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_owner_email((select u.email from auth.users u where u.id = new.id)) then
    new.is_admin := true;
    new.is_performer := true;
    new.is_producer := true;
    new.moderation_status := 'approved';
  end if;
  return new;
end;
$$;

create trigger profiles_owner_bootstrap before insert on profiles
  for each row execute function private.bootstrap_owner_profile();

-- The performer and producer child rows, so the owner can create a listing
-- and sign up for one the moment onboarding finishes.
create or replace function private.bootstrap_owner_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_admin and private.is_owner_email(
       (select u.email from auth.users u where u.id = new.id)) then
    insert into public.performer_profiles (profile_id) values (new.id)
      on conflict (profile_id) do nothing;
    insert into public.producer_profiles (profile_id, verified) values (new.id, true)
      on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger profiles_owner_bootstrap_children after insert on profiles
  for each row execute function private.bootstrap_owner_children();

-- Backfill: an owner account that already exists (signed up before this
-- migration) gets the same treatment. Runs as the migration role, where
-- auth.uid() is null, so profiles_guard leaves the write alone.
update profiles p
set is_admin = true,
    is_performer = true,
    is_producer = true,
    moderation_status = 'approved'
from auth.users u
where u.id = p.id and private.is_owner_email(u.email);

insert into performer_profiles (profile_id)
select p.id from profiles p
join auth.users u on u.id = p.id
where private.is_owner_email(u.email)
on conflict (profile_id) do nothing;

insert into producer_profiles (profile_id, verified)
select p.id, true from profiles p
join auth.users u on u.id = p.id
where private.is_owner_email(u.email)
on conflict (profile_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Test kit plumbing: kill switch, registry, guard
-- ---------------------------------------------------------------------------

create table test_kit_settings (
  id          boolean primary key default true check (id),
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);
insert into test_kit_settings (id) values (true);

alter table test_kit_settings enable row level security;
create policy "test kit settings admin select" on test_kit_settings
  for select to authenticated using (private.is_admin());
-- Writes go through test_kit_set_enabled, never straight to the table.

-- Everything the kit creates, so reset is exact instead of best effort.
create table test_kit_objects (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in
                ('auth_user', 'profile', 'venue', 'series', 'signup',
                 'report', 'flag', 'claim', 'favorite')),
  row_id      uuid not null,
  scenario    text,
  created_by  uuid references profiles (id),
  created_at  timestamptz not null default now(),
  unique (kind, row_id)
);
create index test_kit_objects_kind_idx on test_kit_objects (kind);

alter table test_kit_objects enable row level security;
create policy "test kit objects admin select" on test_kit_objects
  for select to authenticated using (private.is_admin());
-- No insert, update, or delete policy: only the definer functions below write.

create or replace function private.test_kit_guard()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'the test kit is admin only' using errcode = '42501';
  end if;
  if not coalesce((select s.enabled from public.test_kit_settings s), false) then
    raise exception 'the test kit is switched off for this environment'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.test_kit_track(
  p_kind text, p_row_id uuid, p_scenario text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.test_kit_objects (kind, row_id, scenario, created_by)
  values (p_kind, p_row_id, p_scenario, auth.uid())
  on conflict (kind, row_id) do update set scenario = excluded.scenario
  returning row_id;
$$;

-- Password hashing needs pgcrypto, which sits in `public` on a plain
-- Postgres and in `extensions` on hosted Supabase. This is the one function
-- that cannot use an empty search_path; it touches no tables.
create or replace function private.test_kit_password_hash(p_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return crypt(p_password, gen_salt('bf'));
end;
$$;

-- The shared password for every generated test sign-in. Documented in
-- docs/TEST_KIT.md and surfaced in the app so a second device can sign in.
create or replace function private.test_kit_password()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'openmic-test-1234'::text;
$$;

-- ---------------------------------------------------------------------------
-- 3. Building blocks: test people, venues, series
-- ---------------------------------------------------------------------------

-- Deterministic test performer number N. Reused if it already exists, so
-- calling a scenario twice does not pile up accounts.
create or replace function private.test_kit_performer(p_index int, p_scenario text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names  text[] := array[
    'Ronnie Sparks', 'Mabel Quintero', 'Dev Okonkwo', 'Sunny Bhatt',
    'Cass Lindqvist', 'Theo Marchetti', 'Priya Raman', 'June Delacroix',
    'Wes Abernathy', 'Nadia Fontaine', 'Oscar Villanueva', 'Bea Kowalski'];
  v_name   text := v_names[((p_index - 1) % array_length(v_names, 1)) + 1];
  v_email  text := 'test.performer' || p_index || '@openmic.test';
  v_handle text := 'test_performer' || p_index;
  v_id     uuid;
  v_home   record;
begin
  select u.id into v_id from auth.users u where lower(u.email) = v_email;
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
     confirmation_token, recovery_token, email_change, email_change_token_new,
     email_change_token_current, phone_change, phone_change_token,
     reauthentication_token)
  values
    (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     v_email, private.test_kit_password_hash(private.test_kit_password()), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(),
     '', '', '', '', '', '', '', '');

  insert into auth.identities
    (id, user_id, provider_id, provider, identity_data, last_sign_in_at,
     created_at, updated_at)
  values
    (gen_random_uuid(), v_id, v_id::text, 'email',
     jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
     now(), now(), now());

  select p.home_city, p.home_region, p.home_lat, p.home_lng
  into v_home
  from public.profiles p where p.id = auth.uid();

  -- stage_name is the public identity (display_name is private), so both are
  -- set explicitly rather than leaning on any fallback.
  insert into public.profiles
    (id, handle, display_name, stage_name, bio, home_city, home_region,
     home_lat, home_lng, birth_year, is_performer, is_producer, is_admin,
     eula_version, moderation_status)
  values
    (v_id, v_handle::public.citext, v_name, v_name, 'Test account from the test kit.',
     coalesce(v_home.home_city, 'Seattle'), coalesce(v_home.home_region, 'WA'),
     coalesce(v_home.home_lat, 47.6062), coalesce(v_home.home_lng, -122.3321),
     1992, true, true, false,
     (select e.version from public.eula_versions e order by e.published_at desc limit 1),
     'approved');

  insert into public.performer_profiles (profile_id, disciplines, experience)
  values (v_id,
          array[(array['music', 'comedy', 'poetry'])[1 + (p_index % 3)]]::public.discipline[],
          'developing')
  on conflict (profile_id) do nothing;

  insert into public.producer_profiles (profile_id) values (v_id)
  on conflict (profile_id) do nothing;

  perform private.test_kit_track('auth_user', v_id, p_scenario);
  perform private.test_kit_track('profile', v_id, p_scenario);
  return v_id;
end;
$$;

-- The caller's home point, falling back to Seattle when they have not
-- geocoded one yet.
create or replace function private.test_kit_home(out lat double precision, out lng double precision)
returns record
language plpgsql
security definer
set search_path = ''
as $$
begin
  select coalesce(p.home_lat, 47.6062), coalesce(p.home_lng, -122.3321)
  into lat, lng
  from public.profiles p where p.id = auth.uid();
  lat := coalesce(lat, 47.6062);
  lng := coalesce(lng, -122.3321);
end;
$$;

-- One mic: venue plus series, positioned relative to the caller's home area
-- and scheduled relative to their local today. Returns the series id.
-- Occurrences appear through the existing series insert trigger.
create or replace function private.test_kit_mic(
  p_scenario         text,
  p_title            text,
  p_disciplines      discipline[],
  p_timezone         text,
  p_day_offset       int,
  p_start_time       time,
  p_method           signup_method,
  p_cost_cents       int,
  p_capacity         smallint,
  p_owner            uuid,
  p_lat_offset       double precision,
  p_lng_offset       double precision,
  p_confirmed_ago    interval default null,
  p_moderation       moderation_status default 'approved',
  p_venue_name       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_home      record;
  v_venue     uuid;
  v_series    uuid;
  v_local_day date;
  v_weekday   text;
begin
  select * into v_home from private.test_kit_home();
  v_local_day := ((now() at time zone p_timezone)::date) + p_day_offset;
  v_weekday := (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from v_local_day)::int];

  insert into public.venues
    (name, address_line, neighborhood, city, region, location, age_restriction,
     wheelchair_accessible, has_pa, has_stage, parking_notes, created_by, moderation_status)
  values
    (coalesce(p_venue_name, p_title || ' Room'),
     (100 + (p_day_offset * 7)) || ' Test Ave',
     'Test data', 'Test City', 'WA',
     public.st_setsrid(
       public.st_makepoint(v_home.lng + p_lng_offset, v_home.lat + p_lat_offset), 4326
     )::public.geography,
     'all_ages', true, true, true, 'Test kit venue. Safe to delete.',
     auth.uid(), 'approved')
  returning id into v_venue;
  perform private.test_kit_track('venue', v_venue, p_scenario);

  insert into public.mic_series
    (venue_id, created_by, owner_id, title, disciplines, description, rrule,
     anchor_date, start_time, doors_offset, timezone, signup_method,
     signup_opens, signup_closes, set_length_minutes, cost_cents, capacity,
     is_active, last_confirmed_at, last_confirmed_by, moderation_status)
  values
    (v_venue, auth.uid(), p_owner, p_title, p_disciplines,
     'Created by the test kit. Safe to delete from Testing tools.',
     'FREQ=WEEKLY;INTERVAL=1;BYDAY=' || v_weekday,
     v_local_day, p_start_time, interval '30 minutes', p_timezone, p_method,
     interval '7 days', interval '0', 5, p_cost_cents, p_capacity,
     true,
     case when p_confirmed_ago is not null then now() - p_confirmed_ago end,
     case when p_confirmed_ago is not null then auth.uid() end,
     p_moderation)
  returning id into v_series;
  perform private.test_kit_track('series', v_series, p_scenario);

  return v_series;
end;
$$;

-- Put p_count test performers on a night. Used by the scenarios and exposed
-- directly so a real listing can be loaded up too.
create or replace function private.test_kit_add_signups(
  p_occurrence_id uuid, p_count int, p_scenario text
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_performer uuid;
  v_signup    uuid;
  v_added     int := 0;
  i           int;
begin
  for i in 1..greatest(p_count, 0) loop
    v_performer := private.test_kit_performer(i, p_scenario);
    insert into public.signups (occurrence_id, performer_id)
    values (p_occurrence_id, v_performer)
    on conflict (occurrence_id, performer_id) do nothing
    returning id into v_signup;
    if v_signup is not null then
      perform private.test_kit_track('signup', v_signup, p_scenario);
      v_added := v_added + 1;
    end if;
  end loop;
  return v_added;
end;
$$;

-- The next scheduled night of a series, which is what every scenario wants
-- to hand back to the app so it can deep link straight there.
create or replace function private.test_kit_next_occurrence(p_series_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select o.id
  from public.mic_occurrences o
  where o.series_id = p_series_id and o.status = 'scheduled'
  order by o.starts_at
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Scenarios
-- ---------------------------------------------------------------------------

create or replace function test_kit_seed_scenario(
  p_scenario text,
  p_timezone text default 'America/Los_Angeles'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz         text := coalesce(p_timezone, 'America/Los_Angeles');
  v_uid        uuid := auth.uid();
  v_series     uuid;
  v_occurrence uuid;
  v_other      uuid;
  v_result     jsonb := '{}'::jsonb;
  v_local      timestamp;
  v_signup     uuid;
  v_statuses   public.signup_status[] := array['confirmed', 'waitlisted', 'requested']::public.signup_status[];
  i            int;
begin
  perform private.test_kit_guard();
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception 'unknown timezone: %', v_tz using errcode = '22023';
  end if;

  -- Owning a series needs the producer row; performing needs the performer flag.
  insert into public.producer_profiles (profile_id) values (v_uid)
    on conflict (profile_id) do nothing;
  insert into public.performer_profiles (profile_id) values (v_uid)
    on conflict (profile_id) do nothing;
  update public.profiles set is_performer = true, is_producer = true
  where id = v_uid and not (is_performer and is_producer);

  if p_scenario = 'tonight' then
    -- A mic of the caller's own, starting in ninety minutes, with a list
    -- already on it: the night-of roster, on deck, and realtime are all one
    -- tap away.
    v_local := (now() at time zone v_tz) + interval '90 minutes';
    v_series := private.test_kit_mic(
      p_scenario, 'Tonight at the Test Room', array['comedy']::public.discipline[],
      v_tz, (v_local::date - (now() at time zone v_tz)::date)::int, v_local::time,
      'first_come', 0, 12::smallint, v_uid, 0.004, 0.004, interval '1 day');
    v_occurrence := private.test_kit_next_occurrence(v_series);
    perform private.test_kit_add_signups(v_occurrence, 6, p_scenario);
    v_result := jsonb_build_object(
      'series_id', v_series, 'occurrence_id', v_occurrence,
      'summary', 'A mic you run starts in 90 minutes with 6 performers on the list.');

  elsif p_scenario = 'lottery' then
    -- More names than slots, nothing drawn yet.
    v_local := (now() at time zone v_tz) + interval '3 hours';
    v_series := private.test_kit_mic(
      p_scenario, 'Test Kit Lottery Night', array['music']::public.discipline[],
      v_tz, (v_local::date - (now() at time zone v_tz)::date)::int, v_local::time,
      'lottery', 0, 5::smallint, v_uid, -0.006, 0.005, interval '2 days');
    v_occurrence := private.test_kit_next_occurrence(v_series);
    perform private.test_kit_add_signups(v_occurrence, 9, p_scenario);
    v_result := jsonb_build_object(
      'series_id', v_series, 'occurrence_id', v_occurrence,
      'summary', '9 names in the hat for 5 slots, waiting on the draw.');

  elsif p_scenario = 'week' then
    -- A week of other people's mics: every discipline, every signup method,
    -- free and paid, spread from walking distance to a drive away.
    v_other := private.test_kit_performer(1, p_scenario);
    perform private.test_kit_mic(p_scenario, 'Test Monday Music', array['music']::public.discipline[],
      v_tz, 1, time '19:00', 'first_come', 0, 15::smallint, v_other, 0.010, 0.008, interval '3 days');
    perform private.test_kit_mic(p_scenario, 'Test Tuesday Comedy', array['comedy']::public.discipline[],
      v_tz, 2, time '20:00', 'lottery', 500, 20::smallint, v_other, 0.045, -0.030, interval '10 days');
    perform private.test_kit_mic(p_scenario, 'Test Wednesday Poetry', array['poetry']::public.discipline[],
      v_tz, 3, time '18:30', 'first_come', 0, 12::smallint, v_other, -0.090, 0.070, interval '20 days');
    perform private.test_kit_mic(p_scenario, 'Test Thursday Mixed', array['music', 'poetry']::public.discipline[],
      v_tz, 4, time '21:00', 'reserved_slot', 1000, 10::smallint, v_other, 0.180, 0.120, interval '40 days');
    perform private.test_kit_mic(p_scenario, 'Test Friday Variety', array['other']::public.discipline[],
      v_tz, 5, time '22:00', 'host_booked', 0, 8::smallint, v_other, -0.300, -0.200, null);
    perform private.test_kit_mic(p_scenario, 'Test Saturday Comedy', array['comedy']::public.discipline[],
      v_tz, 6, time '19:30', 'first_come', 300, 18::smallint, v_other, 0.320, 0.260, interval '5 days');
    v_result := jsonb_build_object(
      'summary', '6 listings over the next week across every discipline, price, and distance.');

  elsif p_scenario = 'unclaimed' then
    -- An orphan listing plus somebody already asking for it, so both sides
    -- of the claim flow have something to look at.
    v_series := private.test_kit_mic(
      p_scenario, 'Test Unclaimed Mic', array['comedy']::public.discipline[],
      v_tz, 2, time '20:00', 'first_come', 0, 15::smallint, null, 0.020, -0.015, null);
    update public.mic_series set owner_id = null, created_by = null where id = v_series;
    v_other := private.test_kit_performer(2, p_scenario);
    insert into public.claim_requests (series_id, requester_id, evidence)
    values (v_series, v_other, 'Test kit claim: I have hosted this room for two years.')
    on conflict do nothing
    returning id into v_occurrence;
    if v_occurrence is not null then
      perform private.test_kit_track('claim', v_occurrence, p_scenario);
    end if;
    v_result := jsonb_build_object(
      'series_id', v_series,
      'summary', 'An unclaimed listing you can claim, plus a pending claim in the admin queue.');

  elsif p_scenario = 'stale' then
    -- One listing per freshness band, so the badge colours can be compared
    -- side by side.
    perform private.test_kit_mic(p_scenario, 'Test Fresh Listing', array['music']::public.discipline[],
      v_tz, 3, time '20:00', 'first_come', 0, 12::smallint, v_uid, 0.008, 0.006, interval '2 days');
    perform private.test_kit_mic(p_scenario, 'Test Aging Listing', array['comedy']::public.discipline[],
      v_tz, 4, time '20:00', 'first_come', 0, 12::smallint, v_uid, 0.012, -0.009, interval '30 days');
    perform private.test_kit_mic(p_scenario, 'Test Never Confirmed', array['poetry']::public.discipline[],
      v_tz, 5, time '20:00', 'first_come', 0, 12::smallint, v_uid, -0.011, 0.013, null);
    v_result := jsonb_build_object(
      'summary', 'Three listings: confirmed 2 days ago, 30 days ago, and never.');

  elsif p_scenario = 'moderation' then
    -- Something in every section of the queue.
    v_other := private.test_kit_performer(3, p_scenario);
    update public.profiles set moderation_status = 'pending' where id = v_other;
    v_series := private.test_kit_mic(
      p_scenario, 'Test Held Listing', array['comedy']::public.discipline[],
      v_tz, 3, time '20:00', 'first_come', 0, 12::smallint, v_uid, 0.007, 0.011,
      null, 'pending');
    insert into public.reports (reporter_id, target_type, target_id, reason, details)
    values (v_other, 'series', v_series, 'spam',
            'Test kit report. Resolve or dismiss it, nothing real is affected.')
    returning id into v_occurrence;
    perform private.test_kit_track('report', v_occurrence, p_scenario);
    insert into public.listing_flags (series_id, flagger_id, reason, details)
    values (v_series, v_other, 'wrong_time', 'Test kit flag: the start time looks wrong.')
    returning id into v_occurrence;
    perform private.test_kit_track('flag', v_occurrence, p_scenario);
    v_result := jsonb_build_object(
      'series_id', v_series,
      'summary', 'A held profile, a held listing, an abuse report, and a listing flag.');

  elsif p_scenario = 'performer' then
    -- The performer side of the app, seen from the caller's own account:
    -- one signup in each state, plus favourites to drive reminders.
    v_other := private.test_kit_performer(4, p_scenario);
    for i in 1..3 loop
      v_series := private.test_kit_mic(
        p_scenario, 'Test Mic For You ' || i, array['music']::public.discipline[],
        v_tz, i, time '20:00', 'first_come', 0, (10 + i)::smallint, v_other,
        0.006 * i, 0.006 * i, interval '4 days');
      v_occurrence := private.test_kit_next_occurrence(v_series);
      insert into public.signups (occurrence_id, performer_id)
      values (v_occurrence, v_uid)
      on conflict (occurrence_id, performer_id) do nothing
      returning id into v_signup;
      if v_signup is not null then
        update public.signups set status = v_statuses[i] where id = v_signup;
        perform private.test_kit_track('signup', v_signup, p_scenario);
      end if;
      insert into public.favorites (profile_id, series_id) values (v_uid, v_series)
      on conflict do nothing;
      perform private.test_kit_track('favorite', v_series, p_scenario);
    end loop;
    v_result := jsonb_build_object(
      'summary', 'You are on three lists (confirmed, waitlisted, requested) and following all three.');

  else
    raise exception 'unknown scenario: %', p_scenario using errcode = '22023';
  end if;

  return v_result || jsonb_build_object('scenario', p_scenario);
end;
$$;
grant execute on function test_kit_seed_scenario to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Direct tools
-- ---------------------------------------------------------------------------

-- Load any night with test performers, including a real listing of your own.
create or replace function test_kit_fill_roster(p_occurrence_id uuid, p_count int default 5)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_added int;
begin
  perform private.test_kit_guard();
  if p_count < 1 or p_count > 12 then
    raise exception 'pick between 1 and 12 performers' using errcode = '22023';
  end if;
  if not exists (select 1 from public.mic_occurrences o where o.id = p_occurrence_id) then
    raise exception 'that night does not exist' using errcode = 'P0002';
  end if;
  v_added := private.test_kit_add_signups(p_occurrence_id, p_count, 'fill_roster');
  return jsonb_build_object('added', v_added, 'occurrence_id', p_occurrence_id);
end;
$$;
grant execute on function test_kit_fill_roster to authenticated;

-- Move a night to N minutes from now. This is the time machine: it makes
-- signup windows, the night-of view, and day-of reminders reachable without
-- waiting for the calendar. The local date is recomputed in the series
-- timezone so nothing goes naive.
create or replace function test_kit_shift_occurrence(
  p_occurrence_id uuid, p_minutes_from_now int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series    record;
  v_starts    timestamptz := now() + make_interval(mins => p_minutes_from_now);
  v_local_day date;
begin
  perform private.test_kit_guard();
  select s.id, s.timezone, s.doors_offset into v_series
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = p_occurrence_id;
  if not found then
    raise exception 'that night does not exist' using errcode = 'P0002';
  end if;

  v_local_day := (v_starts at time zone v_series.timezone)::date;
  if exists (
    select 1 from public.mic_occurrences o
    where o.series_id = v_series.id and o.local_date = v_local_day
      and o.id <> p_occurrence_id
  ) then
    raise exception 'this mic already has a night on %. Pick a different offset.', v_local_day
      using errcode = '23505';
  end if;

  update public.mic_occurrences
  set starts_at = v_starts,
      local_date = v_local_day,
      doors_at = case when v_series.doors_offset > interval '0'
                      then v_starts - v_series.doors_offset end,
      status = 'scheduled'
  where id = p_occurrence_id;

  return jsonb_build_object('occurrence_id', p_occurrence_id, 'starts_at', v_starts);
end;
$$;
grant execute on function test_kit_shift_occurrence to authenticated;

-- Flip your own performer and producer roles to check each side of the app.
-- Admin is deliberately not settable here: dropping it would lock you out of
-- the kit, and it is not needed to see what a non-admin sees.
create or replace function test_kit_set_roles(p_performer boolean, p_producer boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform private.test_kit_guard();
  if not (p_performer or p_producer) then
    raise exception 'keep at least one role on' using errcode = '22023';
  end if;
  if p_performer then
    insert into public.performer_profiles (profile_id) values (v_uid)
      on conflict (profile_id) do nothing;
  end if;
  if p_producer then
    insert into public.producer_profiles (profile_id) values (v_uid)
      on conflict (profile_id) do nothing;
  end if;
  update public.profiles
  set is_performer = p_performer, is_producer = p_producer
  where id = v_uid;
  return jsonb_build_object('is_performer', p_performer, 'is_producer', p_producer);
end;
$$;
grant execute on function test_kit_set_roles to authenticated;

-- The kill switch. Admin only, and deliberately not behind the guard, so a
-- kit that has been switched off can be switched back on from the app.
create or replace function test_kit_set_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'the test kit is admin only' using errcode = '42501';
  end if;
  update public.test_kit_settings set enabled = p_enabled, updated_at = now();
  return jsonb_build_object('enabled', p_enabled);
end;
$$;
grant execute on function test_kit_set_enabled to authenticated;

create or replace function test_kit_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'the test kit is admin only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'enabled', coalesce((select s.enabled from public.test_kit_settings s), false),
    'password', private.test_kit_password(),
    'counts', coalesce(
      (select jsonb_object_agg(t.kind, t.n)
       from (select kind, count(*) as n from public.test_kit_objects group by kind) t),
      '{}'::jsonb),
    'logins', coalesce(
      (select jsonb_agg(jsonb_build_object('email', u.email, 'name', p.stage_name)
                        order by u.email)
       from public.test_kit_objects o
       join auth.users u on u.id = o.row_id
       join public.profiles p on p.id = o.row_id
       where o.kind = 'auth_user'),
      '[]'::jsonb),
    'next_night', (
      select jsonb_build_object(
               'occurrence_id', o.id, 'series_id', s.id,
               'title', coalesce(o.override_title, s.title), 'starts_at', o.starts_at)
      from public.test_kit_objects t
      join public.mic_series s on s.id = t.row_id and t.kind = 'series'
      join public.mic_occurrences o on o.series_id = s.id
      where o.status = 'scheduled' and o.starts_at > now() - interval '4 hours'
      order by o.starts_at
      limit 1)
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function test_kit_status to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Reset
--
-- Removes exactly what the registry says the kit created, in dependency
-- order, and nothing else. Real listings survive even when test performers
-- were added to them: only those signups go.
-- ---------------------------------------------------------------------------
create or replace function test_kit_reset()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series   uuid[] := array(select row_id from public.test_kit_objects where kind = 'series');
  v_venues   uuid[] := array(select row_id from public.test_kit_objects where kind = 'venue');
  v_people   uuid[] := array(select row_id from public.test_kit_objects where kind = 'profile');
  v_signups  uuid[] := array(select row_id from public.test_kit_objects where kind = 'signup');
  v_occ      uuid[];
  v_counts   jsonb;
begin
  perform private.test_kit_guard();

  v_occ := array(select o.id from public.mic_occurrences o where o.series_id = any (v_series));

  v_counts := jsonb_build_object(
    'series', coalesce(array_length(v_series, 1), 0),
    'venues', coalesce(array_length(v_venues, 1), 0),
    'accounts', coalesce(array_length(v_people, 1), 0),
    'signups', coalesce(array_length(v_signups, 1), 0));

  -- Signups: the tracked ones, plus everything on a test night.
  delete from public.signups
  where id = any (v_signups) or occurrence_id = any (v_occ);

  -- Anything pointing at a test series or a test person.
  delete from public.attendance_log
  where series_id = any (v_series) or occurrence_id = any (v_occ)
     or profile_id = any (v_people);
  delete from public.favorites
  where series_id = any (v_series) or profile_id = any (v_people);
  delete from public.listing_flags
  where series_id = any (v_series) or flagger_id = any (v_people)
     or id in (select row_id from public.test_kit_objects where kind = 'flag');
  delete from public.reports
  where reporter_id = any (v_people)
     or (target_type in ('series', 'occurrence')
         and (target_id = any (v_series) or target_id = any (v_occ)))
     or (target_type = 'profile' and target_id = any (v_people))
     or (target_type = 'venue' and target_id = any (v_venues))
     or id in (select row_id from public.test_kit_objects where kind = 'report');
  delete from public.claim_requests
  where series_id = any (v_series) or requester_id = any (v_people);
  delete from public.notification_outbox
  where profile_id = any (v_people)
     or payload ->> 'occurrence_id' in (select o::text from unnest(v_occ) o);

  delete from public.mic_occurrences where series_id = any (v_series);
  delete from public.mic_series where id = any (v_series);
  delete from public.venues
  where id = any (v_venues)
    and not exists (select 1 from public.mic_series s where s.venue_id = venues.id)
    and not exists (select 1 from public.mic_occurrences o where o.override_venue_id = venues.id);

  -- Test people last. Their per-profile rows cascade from profiles, and
  -- deleting the auth user cascades the profile.
  delete from public.blocks where blocker_id = any (v_people) or blocked_id = any (v_people);
  delete from public.notification_prefs where profile_id = any (v_people);
  delete from public.device_push_tokens where profile_id = any (v_people);
  delete from auth.identities where user_id = any (v_people);
  delete from auth.users where id = any (v_people);
  delete from public.profiles where id = any (v_people);

  delete from public.test_kit_objects;
  return jsonb_build_object('removed', v_counts);
end;
$$;
grant execute on function test_kit_reset to authenticated;
