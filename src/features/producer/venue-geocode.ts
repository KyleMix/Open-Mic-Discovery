import * as Location from 'expo-location';

export type VenueAddress = { street: string; city: string; region: string };
export type Coords = { lat: number; lng: number };

/**
 * The string handed to the geocoder, or null when the address is too
 * incomplete to look anything up. Street alone is ambiguous across cities, so
 * all three parts are required before spending a lookup on it.
 */
export function venueAddressQuery(address: VenueAddress): string | null {
  const street = address.street.trim();
  const city = address.city.trim();
  const region = address.region.trim();
  if (!street || !city || !region) {
    return null;
  }
  return `${street}, ${city}, ${region}`;
}

/** Coordinates that could plausibly be a venue rather than a parse artifact. */
export function isPlausibleCoords(coords: Coords): boolean {
  const { lat, lng } = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return false;
  }
  // Null Island: what a failed lookup tends to return instead of an error.
  return !(lat === 0 && lng === 0);
}

/**
 * Turns a venue address into coordinates with the device geocoder, so
 * producers never have to copy numbers out of a map. No API key and no
 * third-party service: this is the same platform geocoder the home area uses.
 *
 * Returns null when the platform cannot geocode (notably web, where the API is
 * unavailable) or finds no match. Callers keep manual entry as the fallback
 * rather than blocking the form on a lookup.
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
