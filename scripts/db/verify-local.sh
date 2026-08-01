#!/usr/bin/env bash
# Local database verification without Docker.
#
# Rebuilds a throwaway database on the system Postgres, applies the Supabase
# environment shim, runs every migration in order, loads the seed, and runs
# the pgTAP suite. Use `npm run db:start` + `supabase test db` instead when
# Docker is available; this script exists for environments where it is not.
set -euo pipefail

DB=openmicexplorer_verify
cd "$(dirname "$0")/../.."

run_psql() {
  su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB -f '$1'"
}

# Anything still attached blocks the drop. pg_cron's background worker holds a
# connection to whichever database cron.database_name points at, so this is
# not only about a stray psql session left open.
su postgres -c "psql -q -d postgres -c \"select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB' and pid <> pg_backend_pid()\"" >/dev/null
su postgres -c "dropdb --if-exists $DB && createdb $DB"
run_psql scripts/db/shim-supabase.sql

for f in supabase/migrations/*.sql; do
  echo "migration: $f"
  run_psql "$f"
done

echo "seed: supabase/seed.sql"
run_psql supabase/seed.sql

echo "pgTAP:"
su postgres -c "psql -q -d $DB -c 'create extension if not exists pgtap'"

# scheduled-jobs.test.sql asserts the four pg_cron jobs the migrations try to
# register. pg_cron needs shared_preload_libraries and can only be installed
# in the one database cron.database_name names, so plenty of otherwise valid
# local setups cannot run it. Skipping is announced rather than silent: this
# file is enforced in CI, where the full Supabase stack does have pg_cron, and
# a machine that skips it has not verified that the nightly occurrence
# generation and the three retention queues are scheduled at all.
HAS_CRON=$(su postgres -c "psql -qtAX -d $DB -c \"select count(*) from pg_extension where extname = 'pg_cron'\"")
TESTS=(supabase/tests/*.test.sql)
if [ "$HAS_CRON" != "1" ]; then
  echo "SKIPPING supabase/tests/scheduled-jobs.test.sql: pg_cron is not installed here."
  echo "  The scheduled job assertions run in CI against the full Supabase stack."
  TESTS=("${TESTS[@]/supabase\/tests\/scheduled-jobs.test.sql}")
fi
su postgres -c "pg_prove -d $DB ${TESTS[*]}"
