#!/usr/bin/env node
/**
 * Run the test suite in the launch region rather than in UTC.
 *
 *   npm test
 *
 * This app is timezone-heavy by design: every occurrence is a wall clock time
 * in the mic's own zone, and biweekly parity is computed per ISO week. Under
 * TZ=UTC an entire class of bug passes silently, because local and UTC agree,
 * so anything that converts to UTC before reading a calendar date looks
 * correct. computeAnchorDate did exactly that and inverted every alternate
 * week of a biweekly schedule for producers west of Greenwich.
 *
 * America/Los_Angeles is where the app launches, and it is west of Greenwich,
 * so an evening there is already tomorrow in UTC. That is the condition these
 * paths break under, which makes it the honest default to test in.
 *
 * TZ has to be in the environment before Node starts: the runtime resolves
 * the zone once and setting process.env.TZ from inside a setup file is too
 * late. Spawning the runner is what makes that work on Windows too, where
 * `TZ=... jest` is not valid shell.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TZ = process.env.OPENMIC_TEST_TZ ?? 'America/Los_Angeles';

const child = spawn('npx', ['--no-install', 'jest', ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, TZ },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
