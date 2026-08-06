/**
 * src/app is a route table, not a source directory.
 *
 * Expo Router globs `src/app` and turns every file it finds into a route.
 * A test file placed there becomes a real route, gets bundled into the app,
 * and fails at runtime with "expect is not defined" as soon as the bundle is
 * built. Jest still reports the test as passing, so the suite goes green while
 * the app will not start. `npx expo export --platform web` listed
 * `/favorites.test` and `/(tabs)/favorites.test` as routes when this happened.
 *
 * Screen tests belong beside the feature they exercise and import the route
 * module by path. This test is the guard that keeps them there.
 *
 * The filesystem access below is typed locally rather than by pulling in
 * @types/node: tsconfig deliberately pins `types: ["jest"]`, and widening that
 * globally to satisfy one test would change type resolution for the whole app.
 */
type Stats = { isDirectory(): boolean };
type FileSystem = {
  readdirSync(path: string): string[];
  statSync(path: string): Stats;
};

declare const __dirname: string;

const { readdirSync, statSync } = jest.requireActual<FileSystem>('fs');

const APP_DIR = `${__dirname}/app`;

/** Every file under src/app, relative to it. */
function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry: string) => {
    const full = `${dir}/${entry}`;
    const rel = prefix ? `${prefix}/${entry}` : entry;
    return statSync(full).isDirectory() ? filesUnder(full, rel) : [rel];
  });
}

describe('src/app', () => {
  it('contains no test files, because every file there becomes a route', () => {
    const offenders = filesUnder(APP_DIR).filter((f) => /\.(test|spec)\.[jt]sx?$/.test(f));

    expect(offenders).toEqual([]);
  });

  it('is actually being scanned, so the check above cannot pass by accident', () => {
    // If the directory ever moves, the assertion above would find nothing and
    // report success forever. This makes that failure visible instead.
    expect(filesUnder(APP_DIR).length).toBeGreaterThan(0);
  });
});
