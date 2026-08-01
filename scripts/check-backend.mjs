/**
 * Checks that a hosted Supabase project is actually ready to be handed to
 * testers, before a build is made against it.
 *
 * The failure this exists to prevent: an APK builds cleanly, installs cleanly,
 * and then every tester sees "Could not load mics. Check your connection."
 * because the backend it was pointed at was never migrated, never seeded, or
 * is still localhost. The app cannot tell those apart from a flat tyre, and
 * neither can the person holding the phone.
 *
 * Usage:
 *   node scripts/check-backend.mjs <supabase-url> <anon-key>
 *
 * Or with the values already exported:
 *   node scripts/check-backend.mjs
 */

const url = process.argv[2] ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.argv[3] ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const problems = [];
const notes = [];

function fail(message, fix) {
  problems.push({ message, fix });
}

if (!url) {
  fail(
    'No Supabase URL given.',
    'Pass it as the first argument, or export EXPO_PUBLIC_SUPABASE_URL.',
  );
}
if (!anonKey) {
  fail(
    'No Supabase anon key given.',
    'Pass it as the second argument, or export EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

if (problems.length > 0) {
  report();
}

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:\d+)?/i;

if (LOOPBACK.test(url)) {
  fail(
    `The URL is a loopback address (${url}). Only this machine can reach it.`,
    'Point at the hosted project: https://<project-ref>.supabase.co',
  );
  report();
}

if (!url.startsWith('https://')) {
  fail(
    `The URL is not https (${url}).`,
    'Android blocks cleartext traffic by default, so a plain http backend fails on device.',
  );
}

if (anonKey.startsWith('sb_secret_') || anonKey.startsWith('service_role')) {
  fail(
    'That is a secret key, not a publishable one.',
    'A secret key bypasses row level security. It must never be built into an app. ' +
      'Use the publishable key (sb_publishable_...) or the legacy anon key.',
  );
  report();
}

/**
 * Supabase has two key formats in play. The legacy anon key is a JWT and is
 * accepted in both the apikey and Authorization headers. The newer
 * sb_publishable_ key is not a JWT, so some deployments accept it as apikey
 * but reject it as a bearer token. Trying both means a working key is never
 * reported as a broken one.
 */
let authStyle = 'apikey+bearer';

async function get(path) {
  const attempt = async (style) => {
    const headers =
      style === 'apikey+bearer'
        ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
        : { apikey: anonKey };
    const response = await fetch(`${url}${path}`, { headers });
    return { status: response.status, body: await response.text() };
  };

  const first = await attempt(authStyle);
  if (first.status !== 401 && first.status !== 403) {
    return first;
  }
  if (authStyle === 'apikey+bearer') {
    const second = await attempt('apikey');
    if (second.status !== 401 && second.status !== 403) {
      authStyle = 'apikey';
      notes.push(
        'The key is accepted in the apikey header but rejected as a bearer token. ' +
          'That is normal for the newer sb_publishable_ keys and does not affect the app.',
      );
      return second;
    }
  }
  return first;
}

try {
  // 1. Is anything answering, and does it accept this key?
  const root = await get('/rest/v1/');
  if (root.status === 401 || root.status === 403) {
    fail(
      `The anon key was rejected (HTTP ${root.status}).`,
      'Copy the anon/publishable key from the project API settings.',
    );
    report();
  }
  if (root.status >= 500) {
    fail(`The API returned HTTP ${root.status}.`, 'The project may be paused. Resume it.');
    report();
  }

  // 2. Did the migrations land? Every build gates on an EULA row existing, so
  //    a project without this table strands testers on the EULA screen.
  const eula = await get('/rest/v1/eula_versions?select=version&limit=1');
  if (eula.status === 404) {
    fail(
      'Table eula_versions does not exist, so the migrations were never applied.',
      'Run: npx supabase link --project-ref <ref> && npx supabase db push',
    );
  } else if (eula.status !== 200) {
    fail(`Reading eula_versions returned HTTP ${eula.status}: ${eula.body.slice(0, 200)}`, '');
  } else if (JSON.parse(eula.body).length === 0) {
    fail(
      'No EULA version exists. Sign-up gates on accepting one, so nobody can finish onboarding.',
      'Apply the seed, or insert an eula_versions row.',
    );
  }

  // 3. Is there anything to look at? An empty listing table is not broken, but
  //    it is indistinguishable from broken to a tester.
  const mics = await get('/rest/v1/mic_series?select=id&limit=1');
  if (mics.status === 200 && JSON.parse(mics.body).length === 0) {
    notes.push(
      'No mic listings exist yet. Testers will land on an empty Discover screen, ' +
        'which reads as a bug even though the empty state is working. Seed some listings first.',
    );
  }
} catch (error) {
  fail(
    `Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`,
    'Check the URL, and that the project is not paused.',
  );
}

report();

function report() {
  if (problems.length === 0) {
    console.log(`Backend ready: ${url}`);
    for (const note of notes) {
      console.log(`\n  Note: ${note}`);
    }
    process.exit(0);
  }
  console.error(`Backend not ready: ${url ?? '(no url)'}\n`);
  for (const { message, fix } of problems) {
    console.error(`  ${message}`);
    if (fix) {
      console.error(`    ${fix}`);
    }
  }
  console.error('\nDo not build for testers until this passes.');
  process.exit(1);
}
