/**
 * Occurrence timestamps are exact instants; what a reader needs is the
 * wall-clock time at the venue. Formatting in the series' IANA timezone
 * keeps a Chicago 8 PM show reading as 8 PM for a visitor from Seattle.
 * Falls back to device-local formatting when the runtime lacks the zone.
 */
export function formatInZone(
  iso: string,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(iso);
  if (timezone) {
    try {
      return date.toLocaleString(undefined, { ...options, timeZone: timezone });
    } catch {
      // Unknown zone name on this runtime; device-local beats crashing.
    }
  }
  return date.toLocaleString(undefined, options);
}

/** True when the venue's clock differs from the device's right now. */
export function zoneDiffersFromDevice(timezone: string | null | undefined): boolean {
  if (!timezone) {
    return false;
  }
  try {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!device || device === timezone) {
      return false;
    }
    const now = new Date();
    const at = (zone: string) =>
      now.toLocaleString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
    return at(device) !== at(timezone);
  } catch {
    return false;
  }
}
