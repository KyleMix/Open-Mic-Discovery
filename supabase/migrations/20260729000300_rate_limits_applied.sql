-- Apply the private.rate_limit helper (20260729000100) to end-user write
-- paths that could be abused for spam or harassment.
--
-- Defaults (recorded in ARCHITECTURE.md):
--   reports         5 per user per hour
--   listing_flags   5 per user per hour
--   claim_requests  3 per user per day
--   signups        30 per user per day
--   deletion-request Edge Function: 3 per email per hour, 10 per IP per
--   hour, enforced in the function code via deletion_request_allowed.
--
-- The limits ride a generic BEFORE INSERT trigger parameterized by
-- TG_ARGV: (key prefix, max calls, window). Only authenticated end users
-- are limited; seed, service role, and admin flows pass through.

create or replace function private.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_max integer := tg_argv[1]::integer;
  v_window interval := tg_argv[2]::interval;
begin
  if v_uid is null or private.is_admin() then
    return new;
  end if;
  v_key := tg_argv[0] || ':' || v_uid::text;
  if not private.rate_limit(v_key, v_max, v_window) then
    raise exception 'Too many % in a short time. Try again later.', tg_argv[0]
      using errcode = 'P0010';
  end if;
  return new;
end;
$$;

create trigger reports_rate_limit before insert on reports
  for each row execute function private.enforce_rate_limit('reports', '5', '1 hour');

create trigger listing_flags_rate_limit before insert on listing_flags
  for each row execute function private.enforce_rate_limit('listing_flags', '5', '1 hour');

create trigger claim_requests_rate_limit before insert on claim_requests
  for each row execute function private.enforce_rate_limit('claim_requests', '3', '1 day');

create trigger signups_rate_limit before insert on signups
  for each row execute function private.enforce_rate_limit('signups', '30', '1 day');
