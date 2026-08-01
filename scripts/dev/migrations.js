/**
 * Which migrations the local database has not run yet.
 *
 * Read from `supabase migration list`, whose output is a table meant for
 * humans: box-drawing separators, and columns that have moved between CLI
 * versions. Rather than depend on the shape of that table, this counts the
 * 14-digit version stamps on each row. A row carrying one stamp exists as a
 * file and not in the database; a row carrying two exists in both. That holds
 * whichever column order the CLI settles on, and whichever character it draws
 * its rules with.
 *
 * CommonJS on purpose: the scripts beside it are ESM, which can import this,
 * and Jest's transform here covers .js but not .mjs. Keeping it plain is what
 * makes it testable at all.
 */

const { execSync } = require('node:child_process');

const VERSION = /\b\d{14}\b/g;

/** Rows with a single version stamp: on disk, not yet in the database. */
function pendingFromListing(listing) {
  return listing
    .split('\n')
    .map((line) => line.match(VERSION) ?? [])
    .filter((stamps) => stamps.length === 1)
    .map((stamps) => stamps[0]);
}

/**
 * Returns { pending: string[] }, or { error } when the list could not be read
 * at all (no stack running, no CLI).
 */
function readPendingMigrations(cwd) {
  try {
    const listing = execSync('npx --no-install supabase migration list --local', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { pending: pendingFromListing(listing) };
  } catch {
    return { error: 'could not read the migration list' };
  }
}

module.exports = { pendingFromListing, readPendingMigrations };
