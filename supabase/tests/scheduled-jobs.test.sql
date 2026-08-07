-- Scheduled job tests. Runs under pgTAP inside a rolled-back transaction.
--
-- Both pg_cron scheduling blocks in the migrations are wrapped in
-- `exception when others then raise notice`, so a database without pg_cron
-- applies every migration successfully and silently ends up with no jobs.
-- Nothing else in the system notices. The nightly generator is what tops up
-- the rolling occurrence window, so without it the window decays by one day
-- per day until discovery shows nothing upcoming, and the three retention
-- queues stop producing notifications entirely.
--
-- These assertions are the thing that turns that silent no-op into a loud
-- failure. They are deliberately not conditional on pg_cron being present:
-- an environment without it cannot run this product correctly, and a test
-- that skipped itself there would report success for a broken deployment.
begin;
select plan(18);

-- cron.job does not exist at all when the extension failed to install, and a
-- missing relation would abort the file rather than fail a test. This keeps
-- every assertion reportable.
create function pg_temp.job_count(p_name text) returns int language plpgsql as $$
declare
  n int;
begin
  if to_regclass('cron.job') is null then
    return 0;
  end if;
  execute 'select count(*)::int from cron.job where jobname = $1' into n using p_name;
  return n;
end;
$$;

create function pg_temp.job_schedule(p_name text) returns text language plpgsql as $$
declare
  s text;
begin
  if to_regclass('cron.job') is null then
    return null;
  end if;
  execute 'select schedule from cron.job where jobname = $1' into s using p_name;
  return s;
end;
$$;

create function pg_temp.job_command(p_name text) returns text language plpgsql as $$
declare
  c text;
begin
  if to_regclass('cron.job') is null then
    return null;
  end if;
  execute 'select command from cron.job where jobname = $1' into c using p_name;
  return c;
end;
$$;

select is(
  (select count(*)::int from pg_extension where extname = 'pg_cron'),
  1,
  'pg_cron is installed, otherwise no scheduled work runs at all'
);

-- ---------------------------------------------------------------------------
-- The occurrence window top-up. This is the one whose absence is invisible
-- until the product quietly has nothing to show.
-- ---------------------------------------------------------------------------
select is(
  pg_temp.job_count('generate-occurrences-nightly'), 1,
  'the nightly occurrence generator is scheduled'
);
select is(
  pg_temp.job_schedule('generate-occurrences-nightly'), '17 9 * * *',
  'the nightly occurrence generator runs at the quiet hour the migration declares'
);
select is(
  pg_temp.job_command('generate-occurrences-nightly'), 'select private.generate_occurrences()',
  'the nightly job calls the generator, not something renamed out from under it'
);

-- ---------------------------------------------------------------------------
-- The three retention queues.
-- ---------------------------------------------------------------------------
select is(
  pg_temp.job_count('favorite-reminders'), 1,
  'the favorite reminder queue is scheduled'
);
select is(
  pg_temp.job_count('new-mic-alerts'), 1,
  'the new mic alert queue is scheduled'
);
select is(
  pg_temp.job_count('weekly-digest'), 1,
  'the weekly digest queue is scheduled'
);
select is(
  pg_temp.job_count('signup-reminders'), 1,
  'the signup reminder queue is scheduled: people on a list get told before the show'
);

-- ---------------------------------------------------------------------------
-- Draining the outbox. Ten migrations write notification rows and the
-- push-sender Edge Function drains them, but for a long time nothing called
-- it, so every queued notification sat unsent while the feature looked built.
-- These assertions are what makes that impossible to repeat.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_extension where extname = 'pg_net'),
  1,
  'pg_net is installed, without it nothing can call the push-sender function'
);
select is(
  pg_temp.job_count('drain-notification-outbox'), 1,
  'the outbox drain is scheduled, so queued notifications actually send'
);
select is(
  pg_temp.job_schedule('drain-notification-outbox'), '* * * * *',
  'the drain runs every minute, because an on-deck notice is worthless late'
);
select is(
  pg_temp.job_count('push-sender'), 0,
  'the duplicate push-sender minute job is unscheduled: one drain, not two'
);

-- ---------------------------------------------------------------------------
-- The trust loop pair.
-- ---------------------------------------------------------------------------
select is(
  pg_temp.job_count('confirm-nudges'), 1,
  'the confirm-nudge job is scheduled'
);
select is(
  pg_temp.job_count('auto-pause-stale'), 1,
  'the stale-listing auto-pause job is scheduled'
);

-- The functions the jobs name must actually exist, so a rename cannot leave a
-- job scheduled against a dead target.
select has_function('private', 'generate_occurrences',
  'the function the nightly job calls exists');
select has_function('private', 'drain_notification_outbox',
  'the function the drain job calls exists');
select has_function('private', 'queue_signup_reminders',
  'the function the signup reminder job calls exists');
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('queue_favorite_reminders', 'queue_new_mic_alerts', 'queue_weekly_digest')),
  3,
  'every function the retention jobs call exists'
);

select * from finish();
rollback;
