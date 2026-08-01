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

// 3. The Supabase URL has to be the same kind of address as the one the app is
// opened at. This cannot be detected from here, because only the browser knows
// its own origin, so state the pairing rather than guessing at it.
const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(url);
if (inCodespace && isLoopback) {
  ok('URL is loopback, which pairs with opening the app at http://127.0.0.1:8081');
  console.log('        Opening the app at *.app.github.dev instead? Use --codespace.');
  // Blind spot worth naming: every probe below runs inside the Codespace,
  // where loopback always works whether or not the port is forwarded. Only
  // the browser, outside, can tell. A missing forward looks perfectly healthy
  // from here and fails with ERR_CONNECTION_REFUSED there.
  const port = new URL(url).port || '54321';
  console.log(`        CHECK BY HAND: port ${port} must be listed in the Ports panel.`);
  console.log('        Codespaces only auto-forwards ports it detects, and Supabase');
  console.log('        binds inside Docker, so it is often missing. Add Port if so.');
  console.log('        This script cannot see the Ports panel: it runs inside the');
  console.log('        Codespace, where loopback works either way.');
} else if (inCodespace) {
  ok('URL is the forwarded host, which pairs with opening the app at *.app.github.dev');
  console.log('        Opening the app at http://127.0.0.1:8081 instead? Use --localhost.');
  console.log('        Mixing the two gets every request blocked by CORS.');
} else {
  ok('URL host is appropriate for this environment');
}

// 4. Probe the way the app actually would, with the key, against endpoints
// that mean something. Health paths move between Supabase releases, so a 404
// on one proves nothing; sign-in uses GoTrue and PostgREST, so probe those.
const PROBES = [
  { path: '/auth/v1/settings', what: 'auth (GoTrue)' },
  { path: '/rest/v1/', what: 'database (PostgREST)' },
];

/** Returns what a base URL looks like: Supabase, a login page, or neither. */
async function probeBase(rawBase) {
  const base = rawBase.replace(/\/$/, '');
  const result = { supabase: false, loginPage: false, badKey: false, notes: [] };
  for (const { path, what } of PROBES) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.text().catch(() => '');
      const location = res.headers.get('location') ?? '';
      if (location.includes('github.com') || /<html/i.test(body)) {
        result.loginPage = true;
      } else if (res.ok) {
        result.supabase = true;
        result.notes.push(`${what} answered ${res.status}`);
      } else if (res.status === 401 || res.status === 403) {
        result.supabase = true;
        result.badKey = true;
        result.notes.push(`${what} rejected the key (${res.status})`);
      } else {
        result.notes.push(`${what} answered ${res.status}`);
      }
    } catch (error) {
      result.notes.push(`${what} unreachable (${String(error?.cause?.code ?? error?.name)})`);
    }
  }
  return result;
}

const configured = await probeBase(url);
configured.notes.forEach((n) => console.log(`  ...   via .env URL: ${n}`));

// When .env points somewhere other than the stack's own address, probing both
// separates "Supabase is broken" from "only the forwarding is broken". Those
// need completely different fixes and look identical from the browser.
const localUrl = status?.API_URL ?? status?.api_url;
const differs = localUrl && localUrl.replace(/\/$/, '') !== url.replace(/\/$/, '');
const local = differs ? await probeBase(localUrl) : null;
if (local) {
  local.notes.forEach((n) => console.log(`  ...   via ${localUrl}: ${n}`));
}

if (configured.loginPage) {
  bad(
    'the Supabase URL answered with a login page, not Supabase',
    'Set port 54321 to Public in the Ports panel. Private ports bounce\n' +
      '        cross-origin requests to a GitHub login page, which the browser\n' +
      '        reports only as "Failed to fetch".',
  );
} else if (configured.badKey) {
  bad(
    'Supabase rejected the key in .env',
    'npm run dev:env        (the anon key is regenerated on every recreate)',
  );
} else if (configured.supabase) {
  ok('the URL in .env reaches Supabase and the key is accepted');
} else if (local?.supabase) {
  // The decisive case: Supabase is healthy on its own address, so nothing is
  // wrong with the stack. The URL in .env is not carrying traffic to it.
  bad(
    `Supabase is healthy at ${localUrl} but the URL in .env does not reach it`,
    inCodespace
      ? 'npm run dev:env -- --localhost    (pairs with http://127.0.0.1:8081,\n' +
          '        which is the address the dev server prints and VS Code forwards)\n' +
          '        Only keep the forwarded URL if you open the app at\n' +
          '        *.app.github.dev, and then port 54321 must be Public.'
      : 'npm run dev:env        (rewrites .env to the address of the stack)',
  );
} else {
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
