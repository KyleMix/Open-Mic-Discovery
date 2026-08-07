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

/**
 * Report a render error caught by the router error boundary. Inert without a
 * DSN, same as init, so local development stays quiet.
 */
export function reportError(error: Error): void {
  if (!process.env.EXPO_PUBLIC_SENTRY_DSN) {
    return;
  }
  Sentry.captureException(error);
}

/**
 * Every zero-result search, with the filter state that produced it: the
 * closest thing to a list of what people wanted and could not find, which
 * is a product roadmap. Info level, no identity attached, inert without a
 * DSN like everything else here.
 */
export function logZeroResultSearch(query: string, filters: Record<string, unknown>): void {
  if (!process.env.EXPO_PUBLIC_SENTRY_DSN) {
    return;
  }
  Sentry.captureMessage('search_zero_results', {
    level: 'info',
    extra: { query, ...filters },
  });
}
