import type { AgeRangeRequest, AgeRangeResponse } from 'expo-age-range';

import { MINIMUM_AGE } from './validation';

/**
 * expo-age-range's native module does not exist in Expo Go, and importing
 * the package throws there at load time. It is loaded lazily, only when a
 * signal is actually requested, so merely importing this file (the
 * onboarding route does) can never crash a build without the module.
 */
async function requestPlatformAgeRange(options: AgeRangeRequest): Promise<AgeRangeResponse> {
  const mod = await import('expo-age-range');
  return mod.requestAgeRangeAsync(options);
}

/**
 * Platform age signal (Apple Declared Age Range, Google Play age signals),
 * behind a flag so state age-assurance laws can be satisfied with a config
 * flip instead of a rebuild (see ARCHITECTURE.md decisions log).
 *
 * When AGE_SIGNAL_ENABLED is true, signup requests the platform age range
 * and any signal below the in-app gate routes into the existing block path
 * (the same one the birth-year check uses). Nothing is stored beyond the
 * boolean pass/fail of the current attempt; the range itself is discarded.
 *
 * Flag default: false. Enable with EXPO_PUBLIC_AGE_SIGNAL_ENABLED=true.
 */
export function isAgeSignalEnabled(): boolean {
  return process.env.EXPO_PUBLIC_AGE_SIGNAL_ENABLED === 'true';
}

export type AgeSignalVerdict = 'pass' | 'block';

/**
 * Pure routing. Blocks when the platform asserts an age bound below the
 * gate, in either direction:
 * - upperBound below the gate: the user is definitely under it.
 * - lowerBound below the gate: the declared range starts under it
 *   (for example 13 to 17), which is an under-gate signal.
 * - an Android supervised or approval-denied status: a child account.
 * Unknown (null bounds, missing fields) passes: the signal is additive,
 * and the birth-year gate still applies on top, client and server side.
 */
export function evaluateAgeSignal(
  response: AgeRangeResponse,
  gate: number = MINIMUM_AGE,
): AgeSignalVerdict {
  if (response.upperBound != null && response.upperBound < gate) {
    return 'block';
  }
  if (response.lowerBound != null && response.lowerBound < gate) {
    return 'block';
  }
  const status = response.userStatus;
  if (status === 'SUPERVISED' || status === 'SUPERVISED_APPROVAL_PENDING'
      || status === 'SUPERVISED_APPROVAL_DENIED') {
    return 'block';
  }
  return 'pass';
}

/**
 * Requests the platform age signal and returns the error message for the
 * existing block path, or null to proceed. Disabled flag or a failed
 * platform request both pass: this layer only ever adds blocking, and the
 * birth-year gate remains authoritative.
 */
export async function ageSignalError(
  enabled: boolean = isAgeSignalEnabled(),
  request: (options: { threshold1: number }) => Promise<AgeRangeResponse> = requestPlatformAgeRange,
  gate: number = MINIMUM_AGE,
): Promise<string | null> {
  if (!enabled) {
    return null;
  }
  let response: AgeRangeResponse;
  try {
    response = await request({ threshold1: gate });
  } catch {
    return null;
  }
  if (evaluateAgeSignal(response, gate) === 'block') {
    return `You must be at least ${gate} to use Open Mic Finder.`;
  }
  return null;
}
