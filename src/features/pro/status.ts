/**
 * Producer Pro entitlement resolution.
 *
 * Free tier for performers, permanently. Producer Pro gates signup list
 * management and listing analytics. Listing creation, one-tap confirm, and
 * cancellations stay free for every producer: freshness is the product and
 * is never paywalled.
 */

export type ProStatus = 'entitled' | 'not_entitled' | 'unconfigured';

/**
 * Pure resolution used by the hook and tested directly:
 * - RevenueCat configured: its entitlement decides.
 * - Not configured (no API key): development builds are treated as entitled
 *   so the whole flow is testable, with a visible banner; production builds
 *   without configuration fail closed.
 */
export function resolveProStatus(
  configured: boolean,
  devBuild: boolean,
  rcEntitled: boolean,
): { status: ProStatus; entitled: boolean } {
  if (!configured) {
    return { status: 'unconfigured', entitled: devBuild };
  }
  return { status: rcEntitled ? 'entitled' : 'not_entitled', entitled: rcEntitled };
}
