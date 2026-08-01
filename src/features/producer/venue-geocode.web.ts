import { isPlausibleCoords, type Coords } from './venue-address';

export { isPlausibleCoords, venueAddressQuery } from './venue-address';
export type { Coords, VenueAddress } from './venue-address';

/**
 * Web-only geocoder.
 *
 * expo-location removed its web geocoder in SDK 49 ("The Geocoding API has
 * been removed in SDK 49"), so the browser has no platform geocoder to call
 * and the address lookup would fail on every listing. This uses Nominatim,
 * OpenStreetMap's free service, which needs no key.
 *
 * This file only ever enters the web bundle. Metro picks it over
 * venue-geocode.ts by the .web suffix, so the shipped iOS and Android apps
 * keep using the device geocoder and make no third-party request at all. That
 * matters: the Expo web build is a development preview and is not deployed
 * (docs/DEPLOY_WEB.md hosts only the static web/ directory), so this call
 * never reaches a real user and carries no store privacy disclosure.
 *
 * Nominatim's usage policy caps this at one request per second. The form
 * debounces, and a single request is kept in flight at a time. If web ever
 * becomes a shipping surface, replace this with a keyed provider rather than
 * pointing more traffic at a volunteer-run service.
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

let inFlight: Promise<Coords | null> | null = null;

async function lookup(query: string): Promise<Coords | null> {
  const url = `${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    return null;
  }
  const results: unknown = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }
  const first = results[0] as { lat?: string; lon?: string };
  const coords = { lat: Number(first.lat), lng: Number(first.lon) };
  return isPlausibleCoords(coords) ? coords : null;
}

export async function geocodeVenueAddress(query: string): Promise<Coords | null> {
  // One at a time, so a burst of typing cannot fan out into parallel requests.
  const previous = inFlight ?? Promise.resolve(null);
  const next = previous.catch(() => null).then(() => lookup(query).catch(() => null));
  inFlight = next;
  try {
    return await next;
  } finally {
    if (inFlight === next) {
      inFlight = null;
    }
  }
}
