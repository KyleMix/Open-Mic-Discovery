#!/usr/bin/env node
/**
 * Write the local Supabase URL and anon key into .env.
 *
 * `supabase start` prints a fresh anon key, and that key changes whenever the
 * stack is recreated. Copying it by hand is the easiest step to get wrong and
 * the failure is confusing: the app builds fine and every request 401s. This
 * reads the running stack instead.
 *
 *   node scripts/dev/sync-env.mjs                     browser or iOS simulator
 *   node scripts/dev/sync-env.mjs --android-emulator  Android emulator
 *   node scripts/dev/sync-env.mjs --lan               phone on the same Wi-Fi
 *   node scripts/dev/sync-env.mjs --codespace         app opened at *.app.github.dev
 *
 * The host matters. Supabase binds to 127.0.0.1 on the machine running it, but
 * inside an Android emulator 127.0.0.1 is the emulator itself, and on a phone
 * it is the phone. Both need a different address to reach the same stack, which
 * is why signing in works in the browser and hangs everywhere else.
 *
 * In a Codespace the default is still loopback, because VS Code tunnels
 * forwarded ports to 127.0.0.1 on your own machine: opening the app at
 * http://127.0.0.1:8081 means 127.0.0.1:54321 reaches Supabase too. Only when
 * you open the app at its https://<name>-8081.app.github.dev address does
 * Supabase have to be the matching forwarded URL, which is what --codespace
 * writes. The rule is that the two must be the same kind of address: mixing
 * them puts an origin the GitHub proxy will not answer with CORS headers in
 * front of every request.
 *
 * Only EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are touched.
 * Every other line in .env, including comments and your own keys, is kept.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV = join(ROOT, '.env');
const EXAMPLE = join(ROOT, '.env.example');

const URL_KEY = 'EXPO_PUBLIC_SUPABASE_URL';
const ANON_KEY = 'EXPO_PUBLIC_SUPABASE_ANON_KEY';

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function readStatus() {
  try {
    return JSON.parse(
      execSync('npx supabase status -o json', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch {
    fail(
      'Could not read the local Supabase status.\n' +
        '  Start it first:  npm run db:start\n' +
        '  That needs Docker Desktop running (WSL2 backend on Windows).',
    );
  }
}

/** The CLI has renamed these keys before, so accept the known spellings. */
function pick(status, names) {
  for (const name of names) {
    if (typeof status[name] === 'string' && status[name].length > 0) {
      return status[name];
    }
  }
  return undefined;
}

function upsert(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) {
    return contents.replace(pattern, line);
  }
  return `${contents.replace(/\n*$/, '')}\n${line}\n`;
}

/** First non-internal IPv4 address, which is what a phone on the LAN can reach. */
function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return undefined;
}

/**
 * The public URL GitHub Codespaces forwards a port to. In a Codespace the app
 * runs in the browser on your own machine, so it cannot reach the Codespace's
 * loopback at all: it has to go back out through the forwarded hostname.
 */
function codespaceUrl(port) {
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (!name || !domain) {
    fail(
      'This does not look like a Codespace: CODESPACE_NAME and\n' +
        '  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN are not both set.\n' +
        '  Run without --codespace, or pass --localhost to force loopback.',
    );
  }
  return `https://${name}-${port}.${domain}`;
}

/**
 * Repoint a loopback URL at an address the target device can actually reach.
 * Anything that is already non-loopback is left alone.
 */
function retarget(rawUrl, target) {
  if (target === 'localhost') {
    return rawUrl;
  }
  const parsed = new URL(rawUrl);
  if (!['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(parsed.hostname)) {
    return rawUrl;
  }
  if (target === 'codespace') {
    return codespaceUrl(parsed.port || '54321');
  }
  if (target === 'android') {
    // The Android emulator aliases the host machine's loopback to 10.0.2.2.
    parsed.hostname = '10.0.2.2';
    return parsed.toString().replace(/\/$/, '');
  }
  const lan = lanAddress();
  if (!lan) {
    fail('Could not find a LAN IPv4 address on this machine. Connect to Wi-Fi or pass no flag.');
  }
  parsed.hostname = lan;
  return parsed.toString().replace(/\/$/, '');
}

const flags = process.argv.slice(2);
const target = flags.includes('--android-emulator')
  ? 'android'
  : flags.includes('--lan')
    ? 'lan'
    : flags.includes('--codespace')
      ? 'codespace'
      : // Loopback, including in a Codespace: VS Code tunnels forwarded ports
        // to 127.0.0.1 on your own machine, and the Expo dev server prints
        // http://127.0.0.1:8081, so that pairing is what people actually use.
        // --codespace is for opening the app at its app.github.dev address.
        'localhost';

const status = readStatus();
const rawUrl = pick(status, ['API_URL', 'api_url', 'SUPABASE_URL']);
// Supabase is migrating from the legacy anon JWT to publishable keys
// (sb_publishable_...). Recent CLIs print only the new pair in the start
// banner while still reporting ANON_KEY in JSON. Either works as the second
// argument to createClient, so prefer the legacy key and fall back.
const anon = pick(status, [
  'ANON_KEY',
  'anon_key',
  'SUPABASE_ANON_KEY',
  'PUBLISHABLE_KEY',
  'publishable_key',
  'SUPABASE_PUBLISHABLE_KEY',
]);
const url = rawUrl ? retarget(rawUrl, target) : rawUrl;

if (!rawUrl || !anon) {
  fail(
    'Supabase reported status but not an API URL and anon key.\n' +
      `  Keys seen: ${Object.keys(status).join(', ') || '(none)'}\n` +
      '  Run `npx supabase status` and copy the values into .env by hand.',
  );
}

let contents = '';
if (existsSync(ENV)) {
  contents = readFileSync(ENV, 'utf8');
} else if (existsSync(EXAMPLE)) {
  contents = readFileSync(EXAMPLE, 'utf8');
  console.log('  .env did not exist, started it from .env.example');
}

contents = upsert(contents, URL_KEY, url);
contents = upsert(contents, ANON_KEY, anon);
writeFileSync(ENV, contents);

const targetLabel = {
  localhost: 'browser or iOS simulator',
  android: 'Android emulator',
  lan: 'phone on the same Wi-Fi',
  codespace: 'GitHub Codespace (forwarded port)',
}[target];

console.log(`  target: ${targetLabel}`);
console.log(`  ${URL_KEY}=${url}`);
console.log(`  ${ANON_KEY}=${anon.slice(0, 12)}... (${anon.length} chars)`);

if (target === 'codespace') {
  console.log(
    '\n  Only correct if you open the app at its https://<name>-8081.app.github.dev\n' +
      '  address. If you open http://127.0.0.1:8081, which is what the dev server\n' +
      '  prints, rerun without --codespace: mixing the two origins gets every\n' +
      '  request blocked by CORS.\n' +
      '\n  Port 54321 also has to be Public in the Ports panel for this to work.',
  );
} else if (process.env.CODESPACES === 'true') {
  console.log(
    '\n  Codespace detected, and loopback is the right default: VS Code forwards\n' +
      '  54321 to your machine, same as 8081. Make sure 54321 appears in the\n' +
      '  Ports panel. Use --codespace only if you open the app at its\n' +
      '  app.github.dev address instead of http://127.0.0.1:8081.',
  );
}

console.log('\n  .env is up to date. Restart the Expo dev server to pick it up.\n');
