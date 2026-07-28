import * as Location from 'expo-location';

/**
 * Turns a home area string ("Seattle, WA" or "98101") into coordinates
 * using the device geocoder. No API key and no network service of our own.
 * Returns null when the platform cannot geocode (notably web) or finds no
 * match; the app degrades to its default center rather than blocking.
 */
export async function geocodeHomeArea(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await Location.geocodeAsync(query);
    const first = results[0];
    if (!first) {
      return null;
    }
    return { lat: first.latitude, lng: first.longitude };
  } catch {
    return null;
  }
}
