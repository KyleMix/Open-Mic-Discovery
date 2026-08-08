import { Linking } from 'react-native';

/**
 * The one human contact point, used by Settings and the rejected-listing
 * note. Owner decision 2026-08-08: the web presence lives on
 * stonedgooseproductions.com, so support does too. The inbox itself still
 * needs creating before submission (docs/LAUNCH-CHECKLIST.md step 8).
 */
export const SUPPORT_EMAIL = 'kyle@stonedgooseproductions.com';

export function contactSupport(subject: string): void {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(url).catch(() => null);
}
