-- Extensions and enum types.
-- Every later migration builds on these. Enums are additive-only after ship:
-- add values with ALTER TYPE, never remove or reorder.

create extension if not exists postgis;
create extension if not exists citext;

create type discipline as enum ('music', 'comedy', 'poetry', 'other');
create type signup_method as enum ('lottery', 'first_come', 'reserved_slot', 'host_booked');
create type occurrence_status as enum ('scheduled', 'cancelled', 'moved', 'completed');
create type signup_status as enum ('requested', 'confirmed', 'waitlisted', 'drawn', 'performed', 'no_show');
create type experience_level as enum ('new', 'developing', 'experienced', 'professional');
create type age_restriction as enum ('all_ages', 'eighteen_plus', 'twenty_one_plus');
create type report_target as enum ('series', 'venue', 'profile', 'occurrence');
create type report_reason as enum ('spam', 'harassment', 'hate', 'sexual_content', 'violence_threat', 'impersonation', 'illegal', 'other');
create type report_status as enum ('open', 'in_review', 'actioned', 'dismissed');
create type flag_reason as enum ('wrong_time', 'wrong_venue', 'wrong_cost', 'not_happening', 'permanently_dead', 'duplicate', 'other');
create type flag_status as enum ('open', 'confirmed', 'dismissed');
create type claim_status as enum ('pending', 'approved', 'rejected');
create type moderation_status as enum ('pending', 'approved', 'rejected');

-- Private schema for security definer helpers. Not exposed over the API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon, service_role;

-- Shared updated_at trigger.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
