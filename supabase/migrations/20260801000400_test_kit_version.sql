-- Tell the app when the database is behind, and stop a shifted night landing
-- outside the controls it was shifted into.
--
-- A stale database is the single most confusing failure this kit has. The
-- functions are the tools, so a database that has not had the newest
-- migrations applied answers 404 for a tool that does not exist yet and 400
-- for a scenario name it has never heard of, neither of which says "run your
-- migrations". The kit now reports its own version and the app compares it
-- against the version it was built for, so the screen can say the one useful
-- thing instead.
--
-- Bump this whenever a migration adds or changes a test kit entry point, and
-- bump EXPECTED_KIT_VERSION in src/features/testkit/queries.ts with it.

create or replace function private.test_kit_version()
returns int
language sql
immutable
set search_path = ''
as $$
  select 4;
$$;

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
    'kit_version', private.test_kit_version(),
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
    -- live_open answers "can this be run live right now" here rather than on
    -- the device. The window is an hour before the start (see
    -- src/features/live/window.ts), and the database is the one that already
    -- knows the time, so the app needs no clock of its own to decide whether
    -- a night has to be moved first.
    'next_night', (
      select jsonb_build_object(
               'occurrence_id', o.id, 'series_id', s.id,
               'title', coalesce(o.override_title, s.title), 'starts_at', o.starts_at,
               'live_open', o.starts_at - interval '1 hour' <= now()
                            and o.live_ended_at is null)
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

-- Moving a night is how a host gets into the live window on demand, so it has
-- to undo an ended show as well. Without this, a night that was run to its
-- end and then moved still opened on "Show ended", which is a dead end the
-- time machine exists to avoid.
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
      status = 'scheduled',
      live_ended_at = null
  where id = p_occurrence_id;

  return jsonb_build_object('occurrence_id', p_occurrence_id, 'starts_at', v_starts);
end;
$$;
grant execute on function test_kit_shift_occurrence to authenticated;
