#!/usr/bin/env node
/**
 * Diagnose why the app cannot reach Supabase.
 *
 *   npm run dev:doctor
 *
 * "AuthRetryableFetchError: Failed to fetch" in the browser console means the
 * request never got a usable response, and the browser deliberately does not
 * say why. Wrong host, stopped stack, blocked mixed content, and a private
 * Codespace port all look identical from JavaScript. This distinguishes them.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV = join(ROOT, '.env');

const problems = [];
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m, fix) => {
  console.log(`  FAIL  ${m}`);
  problems.push(fix);
};
const warn = (m) => console.log(`  warn  ${m}`);

const inCodespace = process.env.CODESPACES === 'true';
console.log(`\n  environment: ${inCodespace ? 'GitHub Codespace' : 'local machine'}\n`);

// 1. .env exists and has both variables.
if (!existsSync(ENV)) {
  bad('.env does not exist', 'npm run dev:up');
  report();
}

const env = Object.fromEntries(
  readFileSync(ENV, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  bad('.env is missing the Supabase URL or anon key', 'npm run dev:up');
  report();
}
ok(`.env URL is ${url}`);

// Checks run in the order the fixes have to be applied: the stack has to be up
// before dev:env can read a URL and key out of it.

// 2. Is the stack even up, and does .env match the key it is currently issuing?
let status;
try {
  status = JSON.parse(
    execSync('npx supabase status -o json', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  ok('local Supabase is running');
} catch {
  bad('local Supabase is not running', 'npm run db:start');
}

if (status) {
  const live = status.ANON_KEY ?? status.anon_key;
  if (live && live !== anon) {
    bad(
      'the anon key in .env is not the one this stack is issuing',
      'npm run dev:env        (the key is regenerated on every recreate)',
    );
  } else if (live) {
    ok('anon key matches the running stack');
  }
}

// 3. The host has to be reachable from wherever the app actually runs.
const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(url);
if (inCodespace && isLoopback) {
  bad(
    'URL is loopback, but the app runs in a browser outside this Codespace',
    'npm run dev:env        (rewrites it to the forwarded https URL)',
  );
} else if (inCodespace && url.startsWith('http://')) {
  bad(
    'URL is plain http, but the forwarded page is https, so the browser blocks it',
    'npm run dev:env        (rewrites it to https)',
  );
} else {
  ok('URL host is appropriate for this environment');
}

// 4. Probe the way the app actually would, with the key, against endpoints
// that mean something. Health paths move between Supabase releases, so a 404
// on one proves nothing; sign-in uses GoTrue and PostgREST, so probe those.
const base = url.replace(/\/$/, '');
const probes = [
  { path: '/auth/v1/settings', what: 'auth (GoTrue)' },
  { path: '/rest/v1/', what: 'database (PostgREST)' },
];

let sawLoginPage = false;
let reachable = false;

for (const probe of probes) {
  const target = `${base}${probe.path}`;
  try {
    const res = await fetch(target, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.text().catch(() => '');
    const location = res.headers.get('location') ?? '';

    if (location.includes('github.com') || /<html/i.test(body)) {
      sawLoginPage = true;
      continue;
    }
    if (res.ok) {
      ok(`${probe.what} answered ${res.status} with the key in .env`);
      reachable = true;
    } else if (res.status === 401 || res.status === 403) {
      bad(
        `${probe.what} rejected the key in .env (${res.status})`,
        'npm run dev:env        (the anon key is regenerated on every recreate)',
      );
      reachable = true;
    } else {
      warn(`${probe.what} answered ${res.status} at ${probe.path}`);
    }
  } catch (error) {
    const reason = String(error?.cause?.code ?? error?.name ?? error);
    if (isLoopback && inCodespace) {
      warn(`could not reach ${target} from inside the Codespace (${reason})`);
    } else {
      warn(`could not reach ${target} (${reason})`);
    }
  }
}

if (sawLoginPage) {
  bad(
    'the Supabase URL answered with a login page, not Supabase',
    'Set port 54321 to Public in the Ports panel. Private ports bounce\n' +
      '        cross-origin requests to a GitHub login page, which the browser\n' +
      '        reports only as "Failed to fetch".',
  );
} else if (!reachable && !(isLoopback && inCodespace)) {
  bad(
    'neither the auth nor the database endpoint answered like Supabase',
    'Check the stack is healthy: npx supabase status',
  );
}

report();

function report() {
  if (!problems.length) {
    console.log('\n  Nothing wrong found. If the app still cannot sign in, restart the');
    console.log('  dev server: EXPO_PUBLIC_ values are inlined at build time.\n');
    process.exit(0);
  }
  // Several checks can land on the same fix (both probes rejecting one stale
  // key, say). Listing it twice reads like two separate things to do.
  console.log('\n  Fix, in order:\n');
  [...new Set(problems)].forEach((p, i) => console.log(`    ${i + 1}. ${p}`));
  console.log('\n  Then restart the dev server. EXPO_PUBLIC_ values are inlined at');
  console.log('  build time, so editing .env alone changes nothing.\n');
  process.exit(1);
}
