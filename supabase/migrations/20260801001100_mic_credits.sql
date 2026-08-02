-- Featured artists and hosts, per mic and per night.
--
-- A mic has a host, and often a featured artist. For a recurring series both
-- are usually the same every week, and sometimes they are not: a guest host
-- covers a night, a touring act features once. So a credit is either the
-- series default (occurrence_id null) or an override for one night
-- (occurrence_id set), in one table, resolved by preferring the night.
--
-- A credit can point at an app profile or stand alone. Linking is the better
-- path when the person has an account: their stage name and their links stay
-- current without the producer retyping them, and they change everywhere at
-- once when that person updates their profile. Linking is optional because
-- most touring features will not have signed up, and a producer should not be
-- blocked from crediting someone who is not here yet.
--
-- Resolution therefore runs profile first, own column second, per field. That
-- way a linked artist who has not filled in Spotify can still have a Spotify
-- link typed for this booking, without the producer owning the whole record.

create type credit_role as enum ('host', 'featured');

create table public.mic_credits (
  id                uuid primary key default gen_random_uuid(),
  series_id         uuid not null references public.mic_series (id) on delete cascade,
  -- Null means "every night of this series". Set means "this night only".
  occurrence_id     uuid references public.mic_occurrences (id) on delete cascade,
  role              credit_role not null,

  -- Either a linked account or a typed name. Both is allowed: the name then
  -- acts as a fallback if that account is later deleted.
  profile_id        uuid references public.profiles (id) on delete set null,
  name              text check (char_length(name) between 1 and 80),

  -- Used when there is no linked profile, or when the linked profile has not
  -- filled a given network in. Constraints match the profiles columns exactly,
  -- so the same client normalization serves both.
  link_instagram    text check (link_instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  link_tiktok       text check (link_tiktok ~ '^[A-Za-z0-9._]{1,30}$'),
  link_youtube      text check (link_youtube ~ '^https://' and char_length(link_youtube) <= 200),
  link_website      text check (link_website ~ '^https://' and char_length(link_website) <= 200),
  link_spotify      text check (link_spotify ~ '^https://' and char_length(link_spotify) <= 200),
  link_apple_music  text check (link_apple_music ~ '^https://' and char_length(link_apple_music) <= 200),

  moderation_status moderation_status not null default 'pending',
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A credit that names nobody is not a credit.
  constraint mic_credits_identified check (profile_id is not null or name is not null),

  -- One host and one featured per series, and one of each per overridden
  -- night. NULLS NOT DISTINCT is what makes the series-level row unique:
  -- without it every null occurrence_id counts as a different key and a
  -- series could collect any number of hosts.
  constraint mic_credits_one_per_role
    unique nulls not distinct (series_id, occurrence_id, role)
);

create index mic_credits_series_idx on public.mic_credits (series_id);
create index mic_credits_occurrence_idx on public.mic_credits (occurrence_id);
create index mic_credits_profile_idx on public.mic_credits (profile_id);

create trigger mic_credits_updated_at before update on public.mic_credits
  for each row execute function private.set_updated_at();

-- Free text that the public reads goes through the banned-term filter, same
-- as a series title or a venue name. The shared guard reads whichever columns
-- the table actually has, so it needs to learn about this one: without a
-- branch it reaches for new.title and every insert fails outright.
create or replace function private.guard_moderated_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean boolean;
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_table_name = 'venues' then
      v_clean := private.text_is_clean(new.name, new.parking_notes);
    elsif tg_table_name = 'mic_credits' then
      -- A credit's only free text is the performer's name. Everything else on
      -- the row is a link, and those are constrained by shape already.
      v_clean := private.text_is_clean(new.name);
    else
      v_clean := private.text_is_clean(new.title, new.description, new.cost_note);
    end if;
    if tg_op = 'INSERT' then
      new.moderation_status := case when v_clean then 'approved' else 'pending' end;
    elsif new.moderation_status is distinct from old.moderation_status then
      new.moderation_status := old.moderation_status;
    elsif not v_clean then
      new.moderation_status := 'pending';
    end if;
  end if;
  return new;
end;
$$;

create trigger mic_credits_guard before insert or update on public.mic_credits
  for each row execute function private.guard_moderated_writes();

-- An override has to override a night of the series it belongs to. Without
-- this, a producer could attach a credit to somebody else's occurrence and it
-- would surface on their listing.
create or replace function private.validate_credit_occurrence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.occurrence_id is not null then
    if not exists (
      select 1 from public.mic_occurrences o
       where o.id = new.occurrence_id and o.series_id = new.series_id
    ) then
      raise exception 'occurrence % does not belong to series %',
        new.occurrence_id, new.series_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger mic_credits_occurrence_check before insert or update on public.mic_credits
  for each row execute function private.validate_credit_occurrence();

-- ---------------------------------------------------------------------------
-- Row level security. Reading follows the series: if you can see the mic you
-- can see who is on it. Writing follows ownership, exactly as series edits do.
-- ---------------------------------------------------------------------------
alter table public.mic_credits enable row level security;

create policy "credits public select" on public.mic_credits
  for select to anon, authenticated
  using (
    moderation_status = 'approved'
    and exists (
      select 1 from public.mic_series s
       where s.id = series_id and s.deleted_at is null and s.moderation_status = 'approved'
    )
  );

create policy "credits admin select" on public.mic_credits
  for select to authenticated using ((select private.is_admin()));

create policy "credits stakeholder select" on public.mic_credits
  for select to authenticated
  using (
    exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))
    )
  );

create policy "credits manager insert" on public.mic_credits
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))
    )
  );

create policy "credits manager update" on public.mic_credits
  for update to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))
    )
  );

create policy "credits manager delete" on public.mic_credits
  for delete to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1 from public.mic_series s
       where s.id = series_id
         and (s.owner_id = (select auth.uid())
              or (s.owner_id is null and s.created_by = (select auth.uid())))
    )
  );

-- ---------------------------------------------------------------------------
-- The resolved view the app reads.
--
-- Joins public_profiles rather than profiles, so a linked credit inherits that
-- view's filtering for free: a deleted, unapproved or blocked account stops
-- resolving and the credit falls back to whatever was typed.
-- ---------------------------------------------------------------------------
create view public.mic_credit_public
with (security_invoker = off) as
  select
    c.id,
    c.series_id,
    c.occurrence_id,
    c.role,
    c.profile_id,
    p.handle,
    p.avatar_url,
    coalesce(p.stage_name, c.name) as name,
    coalesce(p.link_instagram, c.link_instagram)     as link_instagram,
    coalesce(p.link_tiktok, c.link_tiktok)           as link_tiktok,
    coalesce(p.link_youtube, c.link_youtube)         as link_youtube,
    coalesce(p.link_website, c.link_website)         as link_website,
    coalesce(p.link_spotify, c.link_spotify)         as link_spotify,
    coalesce(p.link_apple_music, c.link_apple_music) as link_apple_music
  from public.mic_credits c
  left join public.public_profiles p on p.id = c.profile_id
  where c.moderation_status = 'approved'
    and exists (
      select 1 from public.mic_series s
       where s.id = c.series_id and s.deleted_at is null and s.moderation_status = 'approved'
    );

grant select on public.mic_credit_public to anon, authenticated;
