-- Spots left, and telling a performer where they are in the running order.
--
-- Capacity was already enforced (the lifecycle trigger confirms signups until
-- the room is full and waitlists the rest) but nothing showed it. A performer
-- could not tell whether a mic had fifteen spots left or none until they
-- tapped sign up and landed on a waitlist, which is the worst moment to find
-- out and the reason there was no urgency to sign up early.
--
-- occurrence_spots counts exactly what the lifecycle trigger counts, so the
-- number on screen and the number enforced on insert can never disagree.
-- Aggregate only: it exposes counts, never who.

create view occurrence_spots
with (security_invoker = off) as
  select
    o.id as occurrence_id,
    o.series_id,
    s.capacity,
    -- Same three statuses the lifecycle trigger counts against capacity.
    (select count(*)
       from signups sg
      where sg.occurrence_id = o.id
        and sg.status in ('confirmed', 'drawn', 'performed'))::int as taken,
    -- The rule for "how many are left" lives here and only here, so the
    -- cards, the mic page, and the signup card cannot drift apart.
    case
      when s.capacity is null then null
      else greatest(s.capacity - (
        select count(*)
          from signups sg
         where sg.occurrence_id = o.id
           and sg.status in ('confirmed', 'drawn', 'performed')), 0)
    end::int as spots_left,
    -- Performers who said they are coming but have not taken a slot. On a
    -- walk-in night this is the only forward pressure there is, and it is
    -- deliberately not subtracted from the spots left: a plan reserves
    -- nothing, and a screen that said "full" while the database happily
    -- confirmed the next signup would be lying.
    (select count(*)
       from attendance_plans ap
       join profiles pr on pr.id = ap.profile_id
      where ap.occurrence_id = o.id
        and pr.is_performer
        and not exists (
          select 1 from signups sg2
          where sg2.occurrence_id = o.id
            and sg2.performer_id = ap.profile_id
            and sg2.status in ('confirmed', 'drawn', 'performed', 'requested', 'waitlisted')
        ))::int as planning_performers
  from mic_occurrences o
  join mic_series s on s.id = o.series_id
  -- Matches the public select policy on occurrences: a hidden listing must
  -- not leak its numbers through here.
  where s.deleted_at is null
    and s.moderation_status = 'approved';

grant select on occurrence_spots to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Discovery carries the count, because the browse list is where someone
-- decides which night to commit to. Return types change, so drop first.
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
  featured_name text,
  capacity smallint,
  spots_left integer
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
    n.featured_name,
    s.capacity,
    case
      when s.capacity is null or n.id is null then null
      else greatest(s.capacity - n.taken, 0)
    end
  from mic_series s
  join venues v on v.id = s.venue_id
  cross join ref
  left join lateral (
    select o.id, o.starts_at, o.local_date, o.status, o.featured_name,
           (select count(*)::int from signups sg
             where sg.occurrence_id = o.id
               and sg.status in ('confirmed', 'drawn', 'performed')) as taken
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
  featured_name text,
  capacity smallint,
  spots_left integer
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
    n.featured_name,
    s.capacity,
    case
      when s.capacity is null or n.starts_at is null then null
      else greatest(s.capacity - n.taken, 0)
    end
  from mic_series s
  join venues v on v.id = s.venue_id
  cross join ref
  left join lateral (
    select o.starts_at, o.featured_name,
           (select count(*)::int from signups sg
             where sg.occurrence_id = o.id
               and sg.status in ('confirmed', 'drawn', 'performed')) as taken
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
-- Telling a performer where they are in the running order.
--
-- The status notice already fired on confirm, draw, and waitlist, but never
-- carried the number, which is the one thing a performer wants to know: not
-- "you are on the list" but "you are fourth, so be back by nine". The draw
-- sets status and position in the same statement, so the number is folded
-- into that message rather than sent as a second push.
-- ---------------------------------------------------------------------------
create or replace function private.queue_signup_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_prefs record;
  v_spot  text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    select coalesce(np.signup_updates, true) as enabled into v_prefs
    from public.notification_prefs np where np.profile_id = new.performer_id;
    if not found or v_prefs.enabled then
      select coalesce(o.override_title, s.title) into v_title
      from public.mic_occurrences o
      join public.mic_series s on s.id = o.series_id
      where o.id = new.occurrence_id;
      v_spot := case
        when new.slot_position is not null and new.status in ('confirmed', 'drawn')
        then ' You are number ' || new.slot_position || '.'
        else '' end;
      insert into public.notification_outbox (profile_id, kind, title, body, payload)
      values (
        new.performer_id,
        'signup_status',
        v_title,
        case new.status
          when 'confirmed' then 'You are on the list.'
          when 'drawn' then 'You were drawn! You are on the list.'
          when 'waitlisted' then 'You are on the waitlist.'
          when 'performed' then 'Marked as performed. Nice set.'
          when 'no_show' then 'You were marked as a no-show.'
          else 'Your signup status changed.'
        end || v_spot,
        jsonb_build_object(
          'occurrence_id', new.occurrence_id,
          'status', new.status,
          'slot_position', new.slot_position
        )
      );
    end if;
  end if;
  return new;
end;
$$;

-- A reorder moves people without changing anyone's status, so it needs its
-- own notice. Only the performers whose number actually moved hear about it.
create or replace function private.queue_slot_move_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if new.slot_position is null
     or new.slot_position is not distinct from old.slot_position
     -- Status changes carry the number themselves; this would double up.
     or new.status is distinct from old.status then
    return new;
  end if;
  if exists (
    select 1 from public.notification_prefs np
    where np.profile_id = new.performer_id and not np.signup_updates
  ) then
    return new;
  end if;
  select coalesce(o.override_title, s.title) into v_title
  from public.mic_occurrences o
  join public.mic_series s on s.id = o.series_id
  where o.id = new.occurrence_id;
  insert into public.notification_outbox (profile_id, kind, title, body, payload)
  values (
    new.performer_id,
    'signup_status',
    v_title,
    'The running order changed. You are number ' || new.slot_position || '.',
    jsonb_build_object(
      'occurrence_id', new.occurrence_id,
      'slot_position', new.slot_position
    )
  );
  return new;
end;
$$;

create trigger signups_notify_slot_move after update on signups
  for each row execute function private.queue_slot_move_notification();
