import { Share } from 'react-native';

import { eventDateShort } from '@/features/discovery/local-time';

/**
 * Sharing a mic.
 *
 * The universal link infrastructure already existed (apple-app-site-association,
 * assetlinks.json, and the Android intent filters all route
 * https://stonedgoose.com/openmic/mic/<id> to the mic screen, with
 * +native-intent.tsx stripping the /openmic prefix) but nothing in the app
 * produced a link, so it was never used. Open mic scenes spread by "come to
 * this on Tuesday" messages, which makes this the cheapest way to grow.
 *
 * The message carries the title, venue, and next date rather than a bare URL,
 * because most messaging apps will not render a preview for a link they cannot
 * fetch, and the recipient should be able to decide without tapping.
 */
const WEB_BASE = 'https://stonedgoose.com/openmic';

export function micShareUrl(seriesId: string): string {
  return `${WEB_BASE}/mic/${seriesId}`;
}

export function micShareMessage(mic: {
  series_id: string;
  title: string;
  venue_name: string | null;
  next_starts_at: string | null;
  timezone: string | null;
}): string {
  const where = mic.venue_name ? ` at ${mic.venue_name}` : '';
  const when = mic.next_starts_at ? ` on ${eventDateShort(mic.next_starts_at, mic.timezone)}` : '';
  return `${mic.title}${where}${when}\n${micShareUrl(mic.series_id)}`;
}

/** Returns false when the sheet was dismissed, so callers can stay quiet. */
export async function shareMic(mic: Parameters<typeof micShareMessage>[0]): Promise<boolean> {
  const result = await Share.share({
    message: micShareMessage(mic),
    // iOS shows title and url separately; Android only reads message.
    title: mic.title,
    url: micShareUrl(mic.series_id),
  });
  return result.action === Share.sharedAction;
}
