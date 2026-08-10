/**
 * Caption templates for the share sheet, one per intent, direct tone
 * (owner decision, 2026-08-10). Pure functions so the wording can change
 * without touching the sheet.
 *
 * Rules these functions own:
 * - The caption stands alone as text. The card image carries the full
 *   details, so the caption says what and when, not everything.
 * - Every field is nullable in practice; a missing one drops its clause,
 *   never printing an empty token, a doubled space, or "at in Seattle".
 * - Recurring mics get the human cadence plus the concrete next date,
 *   never the raw rule.
 * - Venue-local time throughout.
 * - Whole caption, link included, stays under 280 characters.
 */

import { micShareUrl } from '@/features/discovery/share';
import {
  cadence,
  closesClockTime,
  dayAndDate,
  monthDay,
  relativeDayPhrase,
  showClockTime,
  truncate,
} from '@/features/share/format';
import type { Database } from '@/types/database.types';

export type ShareIntent = 'performer' | 'producer' | 'neutral';

export type CaptionMic = {
  series_id: string;
  title: string;
  rrule: string;
  start_time: string;
  timezone: string | null;
  signup_method: Database['public']['Enums']['signup_method'];
  signup_closes: string | null;
  cost_cents: number | null;
  disciplines: readonly Database['public']['Enums']['discipline'][];
  venue_name: string | null;
  neighborhood: string | null;
  city: string | null;
  next_starts_at: string | null;
};

export const CAPTION_MAX = 280;
const TITLE_MAX = 60;
const VENUE_MAX = 40;

function place(mic: CaptionMic): string | null {
  return mic.neighborhood ?? mic.city;
}

/** "Signups close 7:00 PM, show 9:00 PM." said the way this mic's list works. */
function signupSentence(mic: CaptionMic): string | null {
  const show = showClockTime(mic.start_time);
  const closes = closesClockTime(mic.start_time, mic.signup_closes);
  if (mic.signup_method === 'host_booked') {
    return `Show ${show}.`;
  }
  if (mic.signup_method === 'lottery') {
    return closes ? `Name draw ${closes}, show ${show}.` : `Name draw in the app, show ${show}.`;
  }
  return closes ? `Signups close ${closes}, show ${show}.` : `Signups in the app, show ${show}.`;
}

/** "Every Wednesday, next one Aug 12" with graceful halves. */
function cadenceAndNext(mic: CaptionMic): string | null {
  const pattern = cadence(mic.rrule, mic.start_time);
  const next = mic.next_starts_at ? monthDay(mic.next_starts_at, mic.timezone) : null;
  if (pattern && next) {
    return `${pattern}, next one ${next}`;
  }
  if (next && mic.next_starts_at) {
    return `Next one ${dayAndDate(mic.next_starts_at, mic.timezone)}`;
  }
  return pattern;
}

function performerBody(mic: CaptionMic, now: Date): string {
  const title = truncate(mic.title, TITLE_MAX);
  const when = mic.next_starts_at
    ? ` ${relativeDayPhrase(mic.next_starts_at, mic.timezone, now)}`
    : '';
  const venue = mic.venue_name ? ` at ${truncate(mic.venue_name, VENUE_MAX)}` : '';
  const where = place(mic) ? ` in ${place(mic)}` : '';
  return `I'm on the lineup at ${title}${when}${venue}${where}. Show at ${showClockTime(mic.start_time)}. Come out.`;
}

function producerBody(mic: CaptionMic): string {
  const title = truncate(mic.title, TITLE_MAX);
  const venue = mic.venue_name ? ` at ${truncate(mic.venue_name, VENUE_MAX)}` : '';
  const city = mic.city ? `, ${mic.city}` : '';
  const whenSentence = cadenceAndNext(mic);
  const closer = mic.signup_method === 'host_booked' ? '' : ' All levels welcome, spots go fast.';
  return [`${title}${venue}${city}.`, whenSentence ? `${whenSentence}.` : null, signupSentence(mic)]
    .filter(Boolean)
    .join(' ')
    .concat(closer);
}

function neutralBody(mic: CaptionMic): string {
  const single = mic.disciplines.length === 1 ? mic.disciplines[0] : null;
  const what =
    single === 'comedy' || single === 'music' || single === 'poetry'
      ? `Live ${single}`
      : 'An open mic';
  const venue = mic.venue_name ? ` at ${truncate(mic.venue_name, VENUE_MAX)}` : '';
  const city = mic.city ? ` in ${mic.city}` : '';
  const when = mic.next_starts_at ? ` on ${monthDay(mic.next_starts_at, mic.timezone)}` : '';
  const watch = (mic.cost_cents ?? 0) === 0 ? 'Free to watch' : 'Come watch';
  const invite =
    mic.signup_method === 'host_booked' ? `${watch}.` : `${watch}, sign up if you want the mic.`;
  return `${what}${venue}${city}${when}. ${invite}`;
}

/**
 * The full caption for one intent, link included, capped at 280 characters.
 * When a long title pushes past the cap, optional clauses go before the
 * link does: the link is the only part a reader cannot reconstruct.
 */
export function shareCaption(mic: CaptionMic, intent: ShareIntent, now: Date): string {
  const body =
    intent === 'performer'
      ? performerBody(mic, now)
      : intent === 'producer'
        ? producerBody(mic)
        : neutralBody(mic);
  const link = micShareUrl(mic.series_id);
  const caption = `${body}\n${link}`;
  if (caption.length <= CAPTION_MAX) {
    return caption;
  }
  // 1 for the newline the join spends.
  return `${truncate(body, CAPTION_MAX - link.length - 1)}\n${link}`;
}
