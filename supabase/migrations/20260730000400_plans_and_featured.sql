-- Who is coming, and who is featured.
--
-- Two gaps this closes.
--
-- A walk-in list is signed at the venue, so nothing in this app told the
-- producer how many people to expect. They found out when the room filled or
-- did not. "Planning to attend" is a lightweight yes that costs a performer
-- one tap and gives the producer a headcount before the doors open. It is
-- deliberately not a signup: it reserves nothing, it holds no slot, and it is
-- open to people who are coming to watch, because a headcount that only
-- counts performers is not a headcount for a room.
--
-- Second, a producer had no way to say "this night has a guest on it", which
-- is the single most effective thing a mic can advertise. Featured artist
-- lives on the occurrence rather than the series because a guest plays one
-- night, not every night forever.

-- ---------------------------------------------------------------------------
-- Attendance plans.
-- ---------------------------------------------------------------------------
create table attendance_plans (
  occurrence_id  uuid not null references mic_occurrences (id) on delete cascade,
  profile_id     uuid not null references profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (occurrence_id, profile_id)
);
-- The Going tab reads by person; the producer counts read by night.
create index attendance_plans_profile_idx on attendance_plans (profile_id, created_at desc);

alter table attendance_plans enable row level security;

create policy "plans owner select" on attendance_plans
  for select to authenticated using (profile_id = (select auth.uid()));

-- The producer running the night sees who is coming to it. This is the whole
-- point of the feature, and it is why the app says so at the point of the tap.
create policy "plans producer select" on attendance_plans
  for select to authenticated
  using (private.owns_occurrence_series(occurrence_id) or private.is_admin());

create policy "plans owner insert" on attendance_plans
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    -- Same block rule as signups: a producer who blocked someone does not get
    -- that person's name back through a headcount.
    and not private.is_blocked_by_producer(occurrence_id, (select auth.uid()))
    and exists (
      select 1 from public.mic_occurrences o
      where o.id = occurrence_id
        and o.status = 'scheduled'
        and o.starts_at > now()
    )
  );

-- No update policy: there is nothing to change. Changing your mind is a delete.
create policy "plans owner delete" on attendance_plans
  for delete to authenticated using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Featured artist on a night.
-- ---------------------------------------------------------------------------
alter table mic_occurrences
  add column featured_name text check (char_length(featured_name) between 1 and 80),
  add column featured_note text check (char_length(featured_note) <= 200);

-- Occurrences carry no moderation_status, so unlike a venue or a series there
-- is no held state to fall back to. Public free text written by a producer
-- still has to clear the same filter, so this rejects the write instead.
create or replace function private.guard_occurrence_featured()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
begin
  if auth.uid() is null or private.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_changed := new.featured_name is not null or new.featured_note is not null;
  else
    v_changed := new.featured_name is distinct from old.featured_name
              or new.featured_note is distinct from old.featured_note;
  end if;
  if v_changed and not private.text_is_clean(new.featured_name, new.featured_note) then
    raise exception 'featured artist text is not allowed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger mic_occurrences_featured_guard
  before insert or update on mic_occurrences
  for each row execute function private.guard_occurrence_featured();

-- ---------------------------------------------------------------------------
-- Producer-facing reads.
--
-- plan_roster mirrors signup_roster: SECURITY INVOKER, so the policies above
-- decide who sees which rows, and names come from public_profiles so the
-- private display_name stays out of it.
-- ---------------------------------------------------------------------------
create view plan_roster
with (security_invoker = on) as
  select
    ap.occurrence_id,
    ap.profile_id,
    ap.created_at,
    p.handle,
    p.stage_name,
    p.is_performer
  from attendance_plans ap
  left join public_profiles p on p.id = ap.profile_id;

-- Counts for a night, for the producer who runs it. SECURITY DEFINER, so the
-- WHERE clause is the access control: without it this would count every
-- night in the database for anyone who asked.
create view occurrence_attendance
with (security_invoker = off) as
  select
    o.id as occurrence_id,
    o.series_id,
    (select count(*)
       from attendance_plans ap
      where ap.occurrence_id = o.id) as plan_count,
    -- Split out because it changes how a night is run: twelve people coming
    -- with nine of them performing is a different evening from twelve with
    -- two.
    (select count(*)
       from attendance_plans ap
       join profiles pr on pr.id = ap.profile_id
      where ap.occurrence_id = o.id and pr.is_performer) as performer_plan_count,
    (select count(*)
       from signups sg
      where sg.occurrence_id = o.id
        and sg.status in ('requested', 'confirmed', 'waitlisted', 'drawn')) as signup_count
  from mic_occurrences o
  join mic_series s on s.id = o.series_id
  where s.owner_id = (select auth.uid())
     or (s.owner_id is null and s.created_by = (select auth.uid()))
     or private.is_admin();

-- ---------------------------------------------------------------------------
-- The Going tab: every upcoming night this person has said yes to, whether
-- that yes was a signup or a plan. SECURITY INVOKER, so a person sees their
-- own rows and nobody else's without a single predicate here saying so.
-- ---------------------------------------------------------------------------
create view my_upcoming_nights
with (security_invoker = on) as
  with mine as (
    select occurrence_id from attendance_plans where profile_id = (select auth.uid())
    union
    select occurrence_id from signups where performer_id = (select auth.uid())
  )
  select
    o.id as occurrence_id,
    o.starts_at,
    o.status as occurrence_status,
    o.cancellation_note,
    o.featured_name,
    s.id as series_id,
    s.title,
    s.disciplines,
    s.signup_method,
    s.cost_cents,
    s.rrule,
    s.start_time,
    s.timezone,
    s.last_confirmed_at,
    s.poster_url,
    v.name as venue_name,
    coalesce(v.neighborhood, v.city) as neighborhood,
    (ap.occurrence_id is not null) as planning,
    sg.status as signup_status,
    sg.slot_position,
    sg.on_deck_at
  from mine
  join mic_occurrences o on o.id = mine.occurrence_id
  join mic_series s on s.id = o.series_id
  left join venues v on v.id = coalesce(o.override_venue_id, s.venue_id)
  left join signups sg
    on sg.occurrence_id = o.id and sg.performer_id = (select auth.uid())
  left join attendance_plans ap
    on ap.occurrence_id = o.id and ap.profile_id = (select auth.uid());

grant select on plan_roster, occurrence_attendance, my_upcoming_nights to authenticated;

-- ---------------------------------------------------------------------------
-- Discovery carries the featured name.
--
-- A guest on Thursday is the reason someone picks Thursday, so it has to be
-- visible before the mic page. Both functions gain one column from the next
-- occurrence they already look up, so the bodies are otherwise unchanged.
-- Return types change, which means dropping first.
-- ---------------------------------------------------------------------------
drop function if exists mics_near(
  double precision, double precision, integer, discipline[], integer[],
  boolean, signup_method[], integer, integer, integer
);

create function mics_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 40000,
  p_disciplines discipline[] default null,
  p_days integer[] default null,          -- ISO weekday numbers (1 Mon .. 7 Sun)
  p_free_only boolean default false,
  p_methods signup_method[] default null,
  p_start_hour integer default null,      -- local start time window, inclusive
  p_end_hour integer default null,        -- exclusive
  p_limit integer default 100
)
returns table (
  series_id uuid,
  title text,
  disciplines discipline[],
  description text,
  signup_method signup_method,
  cost_cents integer,
  set_length_minutes smallint,
  rrule text,
  start_time time,
  timezone text,
  is_active boolean,
  last_confirmed_at timestamptz,
  poster_url text,
  venue_id uuid,
  venue_name text,
  neighborhood text,
  city text,
  region text,
  lat double precision,
  lng double precision,
  distance_m double precision,
  next_occurrence_id uuid,
  next_starts_at timestamptz,
  next_local_date date,
  next_status occurrence_status,
  featured_name text
)
language sql
stable
set search_path = public
as $$
  with ref as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as pt
  )
  select
    s.id,
    s.title,
    s.disciplines,
    s.description,
    s.signup_method,
    s.cost_cents,
    s.set_length_minutes,
    s.rrule,
    s.start_time,
    s.timezone,
    s.is_active,
    s.last_confirmed_at,
    s.poster_url,
    v.id,
    v.name,
    v.neighborhood,
    v.city,
    v.region,
    st_y(v.location::geometry),
    st_x(v.location::geometry),
    st_distance(v.location, ref.pt),
    n.id,
    n.starts_at,
    n.local_date,
    n.status,
    n.featured_name
  from mic_series s
  join venues v on v.id = s.venue_id
  cross join ref
  left join lateral (
    select o.id, o.starts_at, o.local_date, o.status, o.featured_name
    from mic_occurrences o
    where o.series_id = s.id
      and o.starts_at >= now()
      and o.status <> 'cancelled'
    order by o.starts_at
    limit 1
  ) n on true
  where st_dwithin(v.location, ref.pt, p_radius_m)
    and (p_disciplines is null or s.disciplines && p_disciplines)
    and (not p_free_only or s.cost_cents = 0)
    and (p_methods is null or s.signup_method = any (p_methods))
    and (p_start_hour is null or extract(hour from s.start_time) >= p_start_hour)
    and (p_end_hour is null or extract(hour from s.start_time) < p_end_hour)
    and (p_days is null or exists (
      select 1 from mic_occurrences o2
      where o2.series_id = s.id
        and o2.starts_at between now() and now() + interval '14 days'
        and o2.status <> 'cancelled'
        and extract(isodow from o2.local_date)::int = any (p_days)
    ))
  order by v.location <-> ref.pt
  limit p_limit;
$$;

grant execute on function mics_near(
  double precision, double precision, integer, discipline[], integer[],
  boolean, signup_method[], integer, integer, integer
) to anon, authenticated, service_role;

drop function if exists search_mics(text, double precision, double precision, integer);

create function search_mics(
  p_query text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit integer default 50
)
returns table (
  series_id uuid,
  title text,
  disciplines discipline[],
  signup_method signup_method,
  cost_cents integer,
  rrule text,
  start_time time,
  timezone text,
  last_confirmed_at timestamptz,
  venue_id uuid,
  venue_name text,
  neighborhood text,
  city text,
  region text,
  lat double precision,
  lng double precision,
  distance_m double precision,
  next_starts_at timestamptz,
  poster_url text,
  featured_name text
)
language sql
stable
set search_path = public
as $$
  with ref as (
    select case
      when p_lat is null or p_lng is null then null::geography
      else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    end as pt
  )
  select
    s.id,
    s.title,
    s.disciplines,
    s.signup_method,
    s.cost_cents,
    s.rrule,
    s.start_time,
    s.timezone,
    s.last_confirmed_at,
    v.id,
    v.name,
    v.neighborhood,
    v.city,
    v.region,
    st_y(v.location::geometry),
    st_x(v.location::geometry),
    st_distance(v.location, ref.pt),
    n.starts_at,
    s.poster_url,
    n.featured_name
  from mic_series s
  join venues v on v.id = s.venue_id
  cross join ref
  left join lateral (
    select o.starts_at, o.featured_name
    from mic_occurrences o
    where o.series_id = s.id and o.starts_at >= now() and o.status <> 'cancelled'
    order by o.starts_at
    limit 1
  ) n on true
  where s.title ilike '%' || p_query || '%'
     or v.name ilike '%' || p_query || '%'
     or v.city ilike '%' || p_query || '%'
  order by
    (s.title ilike p_query || '%' or v.name ilike p_query || '%' or v.city ilike p_query || '%') desc,
    st_distance(v.location, ref.pt) asc nulls last,
    s.title
  limit p_limit;
$$;

grant execute on function search_mics(text, double precision, double precision, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deleting an account takes its plans with it. The FK cascades on profile
-- deletion, but accounts are soft-deleted here, so the rows have to go
-- explicitly the way favorites already do.
-- ---------------------------------------------------------------------------
create or replace function private.delete_account_for(v_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles where id = v_uid and deleted_at is null
  ) then
    raise exception 'account not found or already deleted' using errcode = 'P0002';
  end if;
  delete from public.favorites where profile_id = v_uid;
  delete from public.attendance_plans where profile_id = v_uid;
  delete from public.attendance_log where profile_id = v_uid;
  delete from public.device_push_tokens where profile_id = v_uid;
  delete from public.notification_prefs where profile_id = v_uid;
  delete from public.blocks where blocker_id = v_uid or blocked_id = v_uid;
  delete from public.performer_profiles where profile_id = v_uid;
  update public.producer_profiles
  set contact_email = null, contact_phone = null, payout_ref = null
  where profile_id = v_uid;

  -- 22 hex chars (88 bits) of the uuid keep the anonymized handle unique
  -- within the 30-char handle limit; short prefixes have collided.
  update public.profiles
  set handle = ('deleted_' || right(replace(v_uid::text, '-', ''), 22))::public.citext,
      display_name = 'Deleted user',
      stage_name = 'Deleted user',
      avatar_url = null,
      bio = null,
      home_city = null,
      home_region = null,
      home_postal_code = null,
      home_lat = null,
      home_lng = null,
      home_location = null,
      birth_year = null,
      link_instagram = null,
      link_tiktok = null,
      link_youtube = null,
      link_website = null,
      deleted_at = now()
  where id = v_uid;

  -- Removing the auth user ends all sessions and frees the email.
  delete from auth.identities where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;
