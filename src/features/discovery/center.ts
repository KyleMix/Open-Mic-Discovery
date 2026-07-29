import { DEFAULT_CENTER } from './location';

/**
 * Where Discover centers, and why. Reviewers are rarely in the launch city
 * and may deny location, so the resolution order is:
 *
 *   1. A device position from the locate tap (this session only).
 *   2. The profile's private home area, when it geocoded.
 *   3. The seeded Seattle region, with a visible note and search as the
 *      obvious way out. Never a blank screen.
 */
export type DiscoverCenter = {
  lat: number;
  lng: number;
  source: 'device' | 'home' | 'seattle_fallback';
};

export function resolveDiscoverCenter(
  deviceCenter: { lat: number; lng: number } | null,
  homeCenter: { lat: number; lng: number } | null,
): DiscoverCenter {
  if (deviceCenter) {
    return { ...deviceCenter, source: 'device' };
  }
  if (homeCenter) {
    return { ...homeCenter, source: 'home' };
  }
  return { ...DEFAULT_CENTER, source: 'seattle_fallback' };
}

export const SEATTLE_FALLBACK_NOTE =
  'Showing Seattle, the first Open Mic Finder city. Search above to look anywhere else.';
