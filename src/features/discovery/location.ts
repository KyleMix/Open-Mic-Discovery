import * as Location from 'expo-location';

/**
 * Foreground location, requested only when the user taps a "near me"
 * action, never at startup and never in the background. The screen shows
 * an in-context explanation before this is called.
 */
export type LocationResult =
  { status: 'granted'; lat: number; lng: number } | { status: 'denied' } | { status: 'error' };

export async function requestForegroundLocation(): Promise<LocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { status: 'denied' };
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      status: 'granted',
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch {
    return { status: 'error' };
  }
}

/** Fallback map center before the user shares location: downtown Seattle, the seeded city. */
export const DEFAULT_CENTER = { lat: 47.6062, lng: -122.3321 };
