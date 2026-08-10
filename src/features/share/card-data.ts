/**
 * What the share card draws, computed away from the component so the
 * truncation and phrasing are testable without rendering. The card carries
 * exactly six things by design: title, venue, day and date, signup time,
 * place, wordmark. Anything else belongs in the caption or nowhere.
 */

import { costLabel } from '@/features/discovery/cost';
import type { CaptionMic } from '@/features/share/captions';
import {
  cadence,
  closesClockTime,
  dayAndDate,
  monthDay,
  showClockTime,
  truncate,
} from '@/features/share/format';
import { disciplineAccents, type Discipline } from '@/theme';

export type ShareCardMic = CaptionMic & {
  poster_url: string | null;
};

export type ShareCardModel = {
  /** "WEDNESDAY, AUG 12", or the cadence when no night is scheduled. */
  eyebrow: string;
  title: string;
  venue: string | null;
  /** "Signups close 7:00 PM · Show 9:00 PM · $5" */
  meta: string;
  /** "Capitol Hill, Seattle" */
  place: string | null;
  accent: string;
  /** "COMEDY", or "VARIETY" for a mixed bill. */
  discipline: string;
  posterUrl: string | null;
};

// The card is a fixed canvas, so the caps are tighter than the schema's 120.
const TITLE_MAX = 64;
const VENUE_MAX = 44;

function eyebrow(mic: ShareCardMic): string {
  if (mic.next_starts_at) {
    const dated = dayAndDate(mic.next_starts_at, mic.timezone);
    const pattern = cadence(mic.rrule, mic.start_time);
    // A monthly mic reads better as its pattern plus the date: "First
    // Friday" is the identity, the date is the instance. "of the month"
    // goes; the eyebrow is one line and the date already implies it.
    if (pattern && /month/i.test(pattern)) {
      const short = pattern.replace(/ of the month$/i, '');
      return `${short} · next: ${monthDay(mic.next_starts_at, mic.timezone)}`.toUpperCase();
    }
    return dated.toUpperCase();
  }
  return (cadence(mic.rrule, mic.start_time) ?? 'Open mic night').toUpperCase();
}

function metaLine(mic: ShareCardMic): string {
  const show = showClockTime(mic.start_time);
  const closes = closesClockTime(mic.start_time, mic.signup_closes);
  const parts: string[] = [];
  if (mic.signup_method === 'lottery') {
    parts.push(closes ? `Name draw ${closes}` : 'Name draw in the app');
  } else if (mic.signup_method !== 'host_booked' && closes) {
    parts.push(`Signups close ${closes}`);
  }
  parts.push(`Show ${show}`);
  if ((mic.cost_cents ?? 0) > 0) {
    parts.push(costLabel(mic.cost_cents ?? 0));
  }
  return parts.join(' · ');
}

export function buildCardModel(mic: ShareCardMic): ShareCardModel {
  const single = mic.disciplines.length === 1 ? (mic.disciplines[0] as Discipline) : null;
  const placeParts = [mic.neighborhood, mic.city].filter(
    (part): part is string => !!part && part.length > 0,
  );
  return {
    eyebrow: eyebrow(mic),
    title: truncate(mic.title, TITLE_MAX),
    venue: mic.venue_name ? truncate(mic.venue_name, VENUE_MAX) : null,
    meta: metaLine(mic),
    place: placeParts.length > 0 ? placeParts.join(', ') : null,
    accent: single ? disciplineAccents[single] : disciplineAccents.other,
    discipline: (single ?? 'variety').toUpperCase(),
    posterUrl: mic.poster_url,
  };
}
