import * as Sentry from '@sentry/react-native';

/**
 * Crash reporting. Inert without a DSN (local development); enabled in EAS
 * builds via the EXPO_PUBLIC_SENTRY_DSN env. No user identity is attached:
 * crashes are not linked to accounts (see docs/privacy).
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}
