/**
 * Incoming universal links live under the stonedgoose.com/openmic subpath
 * (owner decision, 2026-08-08), but the app's routes do not carry that
 * prefix: https://stonedgoose.com/openmic/mic/<id> must open /mic/<id>.
 * Expo Router hands every externally delivered path through this hook
 * before routing, so the prefix is stripped in exactly one place.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (path.startsWith('/openmic/')) {
    return path.slice('/openmic'.length);
  }
  return path;
}
