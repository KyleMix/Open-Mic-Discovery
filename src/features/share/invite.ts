/**
 * The app invite: one message anyone can send to bring a person onto
 * Open Mic Explorer, no mic attached. Word of mouth is the growth plan,
 * so the invite is reachable from the Profile tab, Settings, and the
 * Network screen, and always says the same thing.
 *
 * The link lands on web/get/index.html, which offers the App Store and
 * Google Play side by side, because an invite goes out before the sender
 * knows what phone the receiver carries.
 */

import { Platform, Share } from 'react-native';

import { appGetUrl } from '@/features/discovery/share';
import { recordInviteEvent } from '@/features/share/analytics';

export const INVITE_MAX = 280;

/** The invite text, link included, under 280 characters like every caption. */
export function inviteMessage(): string {
  return [
    'Come find your next open mic with me. Open Mic Explorer maps every music, comedy, and poetry mic nearby, shows when signups open, and gets you on the list from your phone.',
    `Free on iPhone and Android: ${appGetUrl()}`,
  ].join('\n');
}

export type InviteOutcome = 'shared' | 'copied' | 'dismissed';

const loadClipboard = () => import('expo-clipboard');

/**
 * Open the OS share sheet with the invite. On web (no native sheet),
 * navigator.share where it exists, clipboard otherwise, so the button
 * never dead-ends. Telemetry only on a completed share: an opened and
 * dismissed sheet is not an invitation.
 */
export async function sendAppInvite(profileId: string | null): Promise<InviteOutcome> {
  const message = inviteMessage();
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator | undefined;
    if (nav?.share) {
      try {
        await nav.share({ text: message });
      } catch {
        // Abort (person closed the sheet) and NotAllowed both land here.
        return 'dismissed';
      }
      recordInviteEvent({ profileId, action: 'app_invite', channel: 'web_share' });
      return 'shared';
    }
    await (await loadClipboard()).setStringAsync(message);
    recordInviteEvent({ profileId, action: 'app_invite', channel: 'clipboard' });
    return 'copied';
  }
  const result = await Share.share({ message });
  if (result.action === Share.dismissedAction) {
    return 'dismissed';
  }
  // Android always reports sharedAction; iOS names the destination.
  recordInviteEvent({
    profileId,
    action: 'app_invite',
    channel: 'activityType' in result ? (result.activityType ?? null) : null,
  });
  return 'shared';
}
