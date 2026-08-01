#!/usr/bin/env node
/**
 * Apply any migrations the local database has not run yet.
 *
 *   npm run db:migrate
 *
 * `supabase start` boots whatever database is already in the container. It
 * does not look at supabase/migrations, so pulling new migrations and running
 * the dev script left the database exactly where it was. Everything that
 * failed as a result looked like broken code rather than a database a few
 * commits behind: a function that does not exist yet answers 404, and one
 * that has not learned a new argument value answers 400.
 *
 * This runs as part of `npm run dev:up`, so the database keeps step with the
 * repo without anyone having to remember.
 *
 * Data is kept. Use `npm run db:reset` when a rebuild from scratch plus the
 * seed is what you actually want.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import migrations from './migrations.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Reporting only. `migration up` is idempotent, so it runs either way rather
// than trusting this to decide whether there is work to do.
const { pending, error } = migrations.readPendingMigrations(ROOT);
if (error) {
  console.log(`  ${error}, applying anything pending anyway`);
} else if (pending.length === 0) {
  console.log('  database is up to date with supabase/migrations');
} else {
  console.log(`  applying ${pending.length} migration(s): ${pending.join(', ')}`);
}

try {
  execFileSync('npx', ['--no-install', 'supabase', 'migration', 'up', '--local'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
} catch {
  console.error(
    '\n  Migrations did not apply.\n' +
      '  If the database has drifted too far to patch, rebuild it:\n\n' +
      '    npm run db:reset\n\n' +
      '  That rebuilds from every migration plus the seed, and discards local data.\n',
  );
  process.exit(1);
}
