import * as Location from 'expo-location';

import { isPlausibleCoords, type Coords } from './venue-address';

export { isPlausibleCoords, venueAddressQuery } from './venue-address';
export type { Coords, VenueAddress } from './venue-address';

/**
 * Turns a venue address into coordinates with the device geocoder, so
 * producers never have to copy numbers out of a map. No API key and no
 * third-party service: this is the same platform geocoder the home area uses,
 * and it is the only implementation that ships in the iOS and Android apps.
 *
 * The browser takes venue-geocode.web.ts instead, because expo-location
 * removed its web geocoder in SDK 49.
 *
 * Returns null when the platform finds no match. Callers keep manual entry as
 * the fallback rather than blocking the form on a lookup.
 */
export async function geocodeVenueAddress(query: string): Promise<Coords | null> {
  try {
    const results = await Location.geocodeAsync(query);
    const first = results[0];
    if (!first) {
      return null;
    }
    const coords = { lat: first.latitude, lng: first.longitude };
    return isPlausibleCoords(coords) ? coords : null;
  } catch {
    return null;
  }
}
