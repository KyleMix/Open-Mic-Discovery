import { Linking } from 'react-native';

/**
 * The one human contact point, used by Settings and the rejected-listing
 * note. Placeholder address until the owner picks the real inbox; see
 * DECISIONS_NEEDED.md.
 */
export const SUPPORT_EMAIL = 'support@openmicfinder.app';

export function contactSupport(subject: string): void {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(url).catch(() => null);
}
