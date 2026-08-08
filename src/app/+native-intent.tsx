/**
 * Incoming universal links live under the /open-mics subpath of
 * www.stonedgooseproductions.com (owner decision, 2026-08-08), but the
 * app's routes do not carry that prefix: an incoming
 * /open-mics/mic/<id> must open /mic/<id>.
 * Expo Router hands every externally delivered path through this hook
 * before routing, so the prefix is stripped in exactly one place.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (path.startsWith('/open-mics/')) {
    return path.slice('/open-mics'.length);
  }
  return path;
}
