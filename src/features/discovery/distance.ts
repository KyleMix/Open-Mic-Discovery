const METERS_PER_MILE = 1609.344;

/** "0.4 mi" under ten miles, "12 mi" above: enough precision to decide. */
export function formatMilesFromMeters(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 10) {
    return `${miles.toFixed(1)} mi`;
  }
  return `${Math.round(miles)} mi`;
}

/**
 * The radius filter runs in kilometers server side but reads in miles,
 * since that is what US users think in. Each choice is a friendly label
 * over the exact km value the RPC receives.
 */
export const RADIUS_CHOICES: { km: number; label: string }[] = [
  { km: 8, label: '5 miles' },
  { km: 16, label: '10 miles' },
  { km: 40, label: '25 miles' },
  { km: 80, label: '50 miles' },
];

export function radiusLabel(km: number): string {
  const choice = RADIUS_CHOICES.find((c) => c.km === km);
  return choice ? choice.label : `${Math.round(km / 1.609344)} miles`;
}
