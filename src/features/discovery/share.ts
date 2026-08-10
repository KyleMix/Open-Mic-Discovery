/**
 * The one place a mic's outward-facing URL is built.
 *
 * The universal link infrastructure (apple-app-site-association,
 * assetlinks.json, the Android intent filters, and +native-intent.tsx
 * stripping the /open-mics prefix) routes
 * https://www.stonedgooseproductions.com/open-mics/mic/<id> into the mic
 * screen for people with the app; web/open-mics/mic/ is the landing page
 * for people without it. The share sheet itself lives in
 * src/features/share, where the caption templates and the generated card
 * image are.
 */
const WEB_BASE = 'https://www.stonedgooseproductions.com/open-mics';

export function micShareUrl(seriesId: string): string {
  return `${WEB_BASE}/mic/${seriesId}`;
}
