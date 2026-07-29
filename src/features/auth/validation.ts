/**
 * Pure validation used by sign-up and onboarding. Every function returns an
 * error message string, or null when the value is valid, so screens can show
 * errors inline without throwing.
 */

// Mirrors the server-side gate in supabase/migrations/20260729000200_age_gate_18.sql.
export const MINIMUM_AGE = 18;
export const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) {
    return 'Password must be at least 10 characters.';
  }
  return null;
}

export function validateHandle(handle: string): string | null {
  if (!HANDLE_PATTERN.test(handle)) {
    return 'Handles are 3 to 30 characters: lowercase letters, numbers, and underscores.';
  }
  return null;
}

export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 60) {
    return 'Display name must be 1 to 60 characters.';
  }
  return null;
}

export function validateBirthYear(value: string, now: Date): string | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900) {
    return 'Enter your four-digit birth year.';
  }
  const currentYear = now.getFullYear();
  if (year > currentYear) {
    return 'Enter your four-digit birth year.';
  }
  if (currentYear - year < MINIMUM_AGE) {
    return `You must be at least ${MINIMUM_AGE} to use Open Mic Finder.`;
  }
  return null;
}

export function validateRoles(isPerformer: boolean, isProducer: boolean): string | null {
  if (!isPerformer && !isProducer) {
    return 'Pick at least one role. You can hold both.';
  }
  return null;
}
