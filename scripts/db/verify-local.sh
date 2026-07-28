#!/usr/bin/env bash
# Local database verification without Docker.
#
# Rebuilds a throwaway database on the system Postgres, applies the Supabase
# environment shim, runs every migration in order, loads the seed, and runs
# the pgTAP suite. Use `npm run db:start` + `supabase test db` instead when
# Docker is available; this script exists for environments where it is not.
set -euo pipefail

DB=openmic_verify
cd "$(dirname "$0")/../.."

run_psql() {
  su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB -f '$1'"
}

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
su postgres -c "pg_prove -d $DB supabase/tests/*.test.sql"
