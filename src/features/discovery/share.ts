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
export const WEB_BASE = 'https://www.stonedgooseproductions.com/open-mics';

export function micShareUrl(seriesId: string): string {
  return `${WEB_BASE}/mic/${seriesId}`;
}

/**
 * Where "get the app" points: a static page under the same prefix offering
 * both stores (web/get/index.html). One URL for iPhone and Android alike,
 * because an invite is sent before the sender knows the receiver's phone.
 */
export function appGetUrl(): string {
  return `${WEB_BASE}/get`;
}
