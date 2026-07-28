/**
 * Home area input handling. Every profile needs a city and state, or a
 * 5-digit ZIP. The area is private (used only to center discovery and
 * nearby alerts) and the database enforces both presence and formats.
 */

export type HomeArea = {
  city: string;
  region: string;
  postalCode: string;
};

export function normalizeHomeArea(input: HomeArea): HomeArea {
  return {
    city: input.city.trim(),
    region: input.region.trim().toUpperCase(),
    postalCode: input.postalCode.trim(),
  };
}

/** Null when the combination is acceptable: city+state, or a valid ZIP. */
export function homeAreaError(area: HomeArea): string | null {
  const { city, region, postalCode } = normalizeHomeArea(area);
  if (postalCode.length > 0) {
    if (!/^[0-9]{5}$/.test(postalCode)) {
      return 'ZIP code should be 5 digits.';
    }
    return null;
  }
  if (city.length === 0 || region.length === 0) {
    return 'Enter your city and state, or a ZIP code.';
  }
  if (region.length > 40) {
    return 'That state looks too long.';
  }
  return null;
}

/** The string handed to the device geocoder. */
export function homeAreaQuery(area: HomeArea): string {
  const { city, region, postalCode } = normalizeHomeArea(area);
  if (city.length > 0 && region.length > 0) {
    return `${city}, ${region}`;
  }
  return postalCode;
}

/** "Seattle, WA" or "98101" for the owner-only display. */
export function homeAreaLabel(area: {
  home_city: string | null;
  home_region: string | null;
  home_postal_code: string | null;
}): string | null {
  if (area.home_city && area.home_region) {
    return `${area.home_city}, ${area.home_region}`;
  }
  return area.home_postal_code;
}
