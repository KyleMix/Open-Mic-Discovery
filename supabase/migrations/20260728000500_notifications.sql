-- Push token registry and notification preferences.
-- Tables land now so RLS and types ship together; senders arrive in
-- Phases 4 and 6.

create table device_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  expo_token  text not null unique,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now()
);
create index device_push_tokens_profile_idx on device_push_tokens (profile_id);
create trigger device_push_tokens_updated_at before update on device_push_tokens
  for each row execute function private.set_updated_at();

alter table device_push_tokens enable row level security;
create policy "push tokens owner all" on device_push_tokens
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create table notification_prefs (
  profile_id          uuid primary key references profiles (id) on delete cascade,
  signup_updates      boolean not null default true,
  favorite_reminders  boolean not null default true,
  new_mic_nearby      boolean not null default false,  -- opt-in, radius-scoped
  nearby_radius_km    smallint not null default 25 check (nearby_radius_km between 1 and 160),
  weekly_digest       boolean not null default false,
  updated_at          timestamptz not null default now()
);
create trigger notification_prefs_updated_at before update on notification_prefs
  for each row execute function private.set_updated_at();

alter table notification_prefs enable row level security;
create policy "notification prefs owner all" on notification_prefs
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
