import { palette } from '@/theme';

/**
 * The last-confirmed signal. Freshness is the product: every listing shows
 * one of these tiers, and staleness is shown honestly instead of hidden.
 */
export type FreshnessTier = 'fresh' | 'aging' | 'stale' | 'unknown';

export type Freshness = {
  tier: FreshnessTier;
  label: string;
  color: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function freshness(lastConfirmedAt: string | null, now: Date): Freshness {
  if (!lastConfirmedAt) {
    return { tier: 'unknown', label: 'Not yet confirmed', color: palette.textFaint };
  }
  const days = Math.floor((now.getTime() - new Date(lastConfirmedAt).getTime()) / DAY_MS);
  const label =
    days <= 0
      ? 'Confirmed today'
      : days === 1
        ? 'Confirmed yesterday'
        : `Confirmed ${days} days ago`;
  if (days <= 14) {
    return { tier: 'fresh', label, color: palette.success };
  }
  if (days <= 45) {
    return { tier: 'aging', label, color: palette.warning };
  }
  return { tier: 'stale', label, color: palette.textFaint };
}
