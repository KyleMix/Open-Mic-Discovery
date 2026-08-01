-- "On deck" cannot outlive the set, and a night has to be re-runnable.
--
-- Two things, both found by running a night in the app.
--
-- 1. A performer could be marked done and still be flagged on deck. On deck
--    is a promise that someone is about to be called up, and it stops being
--    true the moment they have been. mark_on_deck already refuses to SET the
--    flag on anyone who is not confirmed or drawn; nothing enforced the
--    mirror of that, so the flag survived being marked performed. The Live
--    screen cleared it for the specific person it expected to be next, which
--    covers the happy path and nothing else: marking people done out of
--    order, or from the list screen, left it behind.
--
--    Enforcing it in the database rather than the screen means it holds for
--    every path, including the ones added later.
--
-- 2. Testing Live meant clicking a whole night to its end and then having no
--    way back to the start. There is now a scenario that drops the host into
--    the middle of a running show, and a way to rewind any night so it can
--    be run again.

-- ---------------------------------------------------------------------------
-- 1. On deck ends when the set does
-- ---------------------------------------------------------------------------
create or replace function private.clear_on_deck_when_finished()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Confirmed and drawn are the two on-the-list states. Anything else means
  -- they are not about to go up, whether that is because they already did,
  -- because they never showed, or because they went back to the waitlist.
  if new.on_deck_at is not null and new.status not in ('confirmed', 'drawn') then
    new.on_deck_at := null;
  end if;
  return new;
end;
$$;

create trigger signups_clear_on_deck before update on signups
  for each row execute function private.clear_on_deck_when_finished();

-- Anyone already carrying a stale flag loses it now, rather than on their
-- next write.
update signups set on_deck_at = null
where on_deck_at is not null and status not in ('confirmed', 'drawn');

-- ---------------------------------------------------------------------------
-- 2. Rewind a night so it can be run again
--
-- Everyone who went up (or did not) goes back to being on the list, in the
-- order they were in, and the show reopens. Waitlisted names stay
-- waitlisted: they never got on, so putting them on would be inventing a
-- different night. The state a performer returns to depends on how the mic
-- fills its list, so a lottery night rewinds to drawn rather than confirmed.
-- ---------------------------------------------------------------------------
create or replace function test_kit_restart_night(p_occurrence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method public.signup_method;
  v_back   public.signup_status;
  v_rows   int;
begin
  perform private.test_kit_guard();

  select s.signup_method into v_method
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = p_occurrence_id;
  if not found then
    raise exception 'that night does not exist' using errcode = 'P0002';
  end if;

  v_back := case when v_method = 'lottery' then 'drawn' else 'confirmed' end::public.signup_status;

  update public.signups
  set status = v_back, on_deck_at = null
  where occurrence_id = p_occurrence_id
    and status in ('performed', 'no_show');
  get diagnostics v_rows = row_count;

  -- Reopen the controls, and put the night back in front of the host if the
  -- clock has already gone past it.
  update public.mic_occurrences
  set live_ended_at = null, status = 'scheduled'
  where id = p_occurrence_id;

  return jsonb_build_object('occurrence_id', p_occurrence_id, 'back_on_the_list', v_rows);
end;
$$;
grant execute on function test_kit_restart_night to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Scenarios: a night already in progress, and a moderation queue that
--    stops anonymizing somebody else's roster.
--
-- The held profile used to be test performer 3, who is also on every roster
-- the kit builds. A held profile is filtered out of public_profiles, so the
-- roster rendered them as a nameless "Performer" on an unrelated night. The
-- moderation scenario now holds a profile of its own that no roster uses.
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

  insert into public.producer_profiles (profile_id) values (v_uid)
    on conflict (profile_id) do nothing;
  insert into public.performer_profiles (profile_id) values (v_uid)
    on conflict (profile_id) do nothing;
  update public.profiles set is_performer = true, is_producer = true
  where id = v_uid and not (is_performer and is_producer);

  if p_scenario = 'tonight' then
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

  elsif p_scenario = 'live' then
    -- Mid-show, which is the state Live is actually used in and the one that
    -- was impossible to reach without clicking a whole night first.
    -- Two done, one no-show, somebody on stage, the next one told they are
    -- on deck, two still to go, and a full list with people waiting.
    v_local := (now() at time zone v_tz) - interval '20 minutes';
    v_series := private.test_kit_mic(
      p_scenario, 'Test Kit Live Room', array['comedy']::public.discipline[],
      v_tz, (v_local::date - (now() at time zone v_tz)::date)::int, v_local::time,
      'first_come', 0, 7::smallint, v_uid, 0.005, -0.004, interval '1 day');
    v_occurrence := private.test_kit_next_occurrence(v_series);
    -- Seven fill the list; the last two land on the waitlist by capacity,
    -- through the same lifecycle a real signup goes through.
    perform private.test_kit_add_signups(v_occurrence, 9, p_scenario);
    update public.signups set status = 'performed'
    where occurrence_id = v_occurrence and slot_position in (1, 2);
    update public.signups set status = 'no_show'
    where occurrence_id = v_occurrence and slot_position = 3;
    -- Slot 4 is on stage (the first not finished), so slot 5 is the one who
    -- needs telling. On deck runs a set ahead, same as the Live screen.
    update public.signups set on_deck_at = now()
    where occurrence_id = v_occurrence and slot_position = 5;
    v_result := jsonb_build_object(
      'series_id', v_series, 'occurrence_id', v_occurrence,
      'summary', 'A show already running: 3 gone, one on stage, next on deck, 2 waiting.');

  elsif p_scenario = 'lottery' then
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
    perform private.test_kit_mic(p_scenario, 'Test Fresh Listing', array['music']::public.discipline[],
      v_tz, 3, time '20:00', 'first_come', 0, 12::smallint, v_uid, 0.008, 0.006, interval '2 days');
    perform private.test_kit_mic(p_scenario, 'Test Aging Listing', array['comedy']::public.discipline[],
      v_tz, 4, time '20:00', 'first_come', 0, 12::smallint, v_uid, 0.012, -0.009, interval '30 days');
    perform private.test_kit_mic(p_scenario, 'Test Never Confirmed', array['poetry']::public.discipline[],
      v_tz, 5, time '20:00', 'first_come', 0, 12::smallint, v_uid, -0.011, 0.013, null);
    v_result := jsonb_build_object(
      'summary', 'Three listings: confirmed 2 days ago, 30 days ago, and never.');

  elsif p_scenario = 'moderation' then
    -- Index 90 is outside the range the rosters draw from (1 to 12), so
    -- holding this profile cannot blank out a name on somebody else's night.
    v_other := private.test_kit_performer(90, p_scenario);
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

-- Any profile the old moderation scenario left held is one of the twelve the
-- rosters use, so it is releasing somebody else's name. Approve them back.
update profiles p
set moderation_status = 'approved'
where p.moderation_status = 'pending'
  and exists (
    select 1 from test_kit_objects t where t.kind = 'profile' and t.row_id = p.id
  )
  and p.handle::text ~ '^test_performer([1-9]|1[0-2])$';
