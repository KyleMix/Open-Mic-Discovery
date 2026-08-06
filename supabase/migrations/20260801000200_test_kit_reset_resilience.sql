-- Reset should never strand test data behind a failure it cannot control.
--
-- Everything test_kit_reset touches in public is this project's own schema,
-- and a failure there is a bug worth surfacing. The auth schema is not: it is
-- owned by supabase_auth_admin, its child tables change with GoTrue versions,
-- and the privileges the migration role holds over it differ between a local
-- stack, a hosted project, and the verification shim used by
-- scripts/db/verify-local.sh.
--
-- Before this, a refusal on the auth deletes aborted the whole function and
-- left every test listing, venue, and signup in place, with the registry
-- still claiming them. Now the sign-ins are removed on a best-effort basis
-- and reset reports what it could not do, so the data always goes even when
-- the login lingers.

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
  v_warning  text;
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
  delete from public.attendance_plans
  where occurrence_id = any (v_occ) or profile_id = any (v_people);
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

  delete from public.blocks where blocker_id = any (v_people) or blocked_id = any (v_people);
  delete from public.notification_prefs where profile_id = any (v_people);
  delete from public.device_push_tokens where profile_id = any (v_people);

  -- The auth schema, best effort. A refusal here must not cost the caller
  -- everything above, which is the part they actually asked to be rid of.
  if array_length(v_people, 1) > 0 then
    begin
      delete from auth.identities where user_id = any (v_people);
      delete from auth.users where id = any (v_people);
    exception when others then
      v_warning := 'Test listings and data were removed, but the test sign-ins could not be: '
                   || sqlerrm || ' (' || sqlstate || ')';
    end;
  end if;

  -- Profiles cascade from auth.users where that succeeded; where it did not,
  -- the profile has to stay too, or it would orphan its own foreign key.
  delete from public.profiles p
  where p.id = any (v_people)
    and not exists (select 1 from auth.users u where u.id = p.id);

  -- Only forget the rows that are actually gone. A sign-in left behind stays
  -- tracked, so the next reset attempt picks it up again.
  delete from public.test_kit_objects t
  where not (t.kind in ('auth_user', 'profile')
             and exists (select 1 from auth.users u where u.id = t.row_id));

  return jsonb_build_object('removed', v_counts)
         || case when v_warning is null then '{}'::jsonb
                 else jsonb_build_object('warning', v_warning) end;
end;
$$;
grant execute on function test_kit_reset to authenticated;
