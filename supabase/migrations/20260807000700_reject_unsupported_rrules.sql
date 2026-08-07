-- An RRULE the generator cannot honour is refused at the boundary.
--
-- Audit finding F-015. private.rrule_matches implements a deliberate subset
-- of RFC 5545, which is the right call: weekly, every-n-weekly, and monthly
-- by ordinal weekday is what open mics actually do. The problem was what it
-- did with anything else, which was to return false for every candidate day,
-- silently. The two shapes that reach that path:
--
--   FREQ=MONTHLY;INTERVAL=2   INTERVAL is parsed and then never consulted in
--                             the monthly branch, so an every-other-month mic
--                             generates every month.
--   FREQ=MONTHLY;BYDAY=TU     a plain weekday with no ordinal skips the loop
--                             entirely, so the series generates no nights at
--                             all and never appears anywhere.
--
-- Neither is reachable from the producer form, which can only emit the
-- supported subset (src/features/producer/rrule-builder.ts). Both are
-- reachable from a seed, the test kit, a hand-written repair, or an import,
-- and a listing that exists but generates nothing is a bad way to find out.
--
-- Validation lands as a boundary trigger rather than inside rrule_matches on
-- purpose. rrule_matches runs once per candidate day inside
-- private.generate_occurrences, which the nightly job runs across every
-- active series in one call: raising from there would let a single bad row
-- abort occurrence generation for the whole database. Refusing the write is
-- the loud failure the finding asks for, and it cannot take the cron down
-- with it. Same shape as the existing mic_series_timezone_check trigger,
-- which validates the IANA zone at the same boundary.
--
-- Down migration:
-- supabase/migrations/down/20260807000700_reject_unsupported_rrules.down.sql

create or replace function private.validate_rrule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parts    jsonb := '{}'::jsonb;
  v_pair     text[];
  v_item     text;
  v_freq     text;
  v_interval int;
  v_byday    text[];
  v_entry    text;
  v_ord      int;
begin
  foreach v_item in array string_to_array(new.rrule, ';') loop
    v_pair := string_to_array(v_item, '=');
    if array_length(v_pair, 1) = 2 then
      v_parts := v_parts || jsonb_build_object(upper(trim(v_pair[1])), trim(v_pair[2]));
    end if;
  end loop;

  v_freq := upper(coalesce(v_parts->>'FREQ', ''));
  v_byday := string_to_array(upper(coalesce(v_parts->>'BYDAY', '')), ',');

  begin
    v_interval := coalesce((v_parts->>'INTERVAL')::int, 1);
  exception when others then
    raise exception 'unsupported recurrence rule %: INTERVAL must be a whole number', new.rrule
      using errcode = '23514';
  end;

  if v_interval < 1 then
    raise exception 'unsupported recurrence rule %: INTERVAL must be at least 1', new.rrule
      using errcode = '23514';
  end if;

  if coalesce(array_length(v_byday, 1), 0) = 0 then
    raise exception 'unsupported recurrence rule %: BYDAY is required', new.rrule
      using errcode = '23514';
  end if;

  if v_freq = 'WEEKLY' then
    foreach v_entry in array v_byday loop
      if v_entry <> all (array['MO','TU','WE','TH','FR','SA','SU']) then
        raise exception
          'unsupported recurrence rule %: weekly BYDAY takes plain weekdays, got %',
          new.rrule, v_entry
          using errcode = '23514';
      end if;
    end loop;

  elsif v_freq = 'MONTHLY' then
    -- The monthly branch of rrule_matches ignores INTERVAL, so accepting one
    -- other than 1 would promise a cadence the generator does not keep.
    if v_interval <> 1 then
      raise exception
        'unsupported recurrence rule %: monthly rules do not support INTERVAL', new.rrule
        using errcode = '23514';
    end if;
    foreach v_entry in array v_byday loop
      if v_entry !~ '^-?[1-5](MO|TU|WE|TH|FR|SA|SU)$' then
        raise exception
          'unsupported recurrence rule %: monthly BYDAY needs an ordinal weekday like 1TU or -1FR, got %',
          new.rrule, v_entry
          using errcode = '23514';
      end if;
      v_ord := (regexp_replace(v_entry, '[A-Z]', '', 'g'))::int;
      if v_ord = 0 or v_ord > 5 or v_ord < -5 then
        raise exception
          'unsupported recurrence rule %: ordinal % is out of range', new.rrule, v_ord
          using errcode = '23514';
      end if;
    end loop;

  else
    raise exception
      'unsupported recurrence rule %: FREQ must be WEEKLY or MONTHLY', new.rrule
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger mic_series_rrule_check before insert or update of rrule on mic_series
  for each row execute function private.validate_rrule();
