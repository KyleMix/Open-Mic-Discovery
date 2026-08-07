import { eventDateShort, eventTime } from '@/features/discovery/local-time';
import { parseIntervalMs } from '@/features/signups/window';
import type { Database } from '@/types/database.types';

type AgeRestriction = Database['public']['Enums']['age_restriction'];

export const AGE_LABELS: Record<AgeRestriction, string> = {
  all_ages: 'All ages',
  eighteen_plus: '18+',
  twenty_one_plus: '21+',
};

/**
 * The terms of the room, one glanceable line on the signup card: when the
 * list closes, how long a set runs, what it costs, who gets in the door.
 * These are the things a person is agreeing to, so they belong beside the
 * commit button, not scattered across cards further down the page.
 */
export function roomTerms(input: {
  /** The night's start, ISO. */
  startsAt: string;
  /** Postgres interval before startsAt when signups close ("0" = showtime). */
  signupCloses: string;
  timezone: string | null;
  setLengthMinutes: number | null;
  /** Preformatted cost label ("Free", "$5"), from the shared costLabel. */
  cost: string;
  ageRestriction: AgeRestriction | null;
}): string {
  const parts: string[] = [];
  const closesMs = new Date(input.startsAt).getTime() - parseIntervalMs(input.signupCloses);
  if (closesMs === new Date(input.startsAt).getTime()) {
    parts.push('List closes at showtime');
  } else {
    const closesIso = new Date(closesMs).toISOString();
    const sameDay =
      eventDateShort(closesIso, input.timezone) === eventDateShort(input.startsAt, input.timezone);
    parts.push(
      sameDay
        ? `List closes ${eventTime(closesIso, input.timezone)}`
        : `List closes ${eventDateShort(closesIso, input.timezone)}, ${eventTime(closesIso, input.timezone)}`,
    );
  }
  if (input.setLengthMinutes) {
    parts.push(`${input.setLengthMinutes} min sets`);
  }
  parts.push(input.cost);
  if (input.ageRestriction) {
    parts.push(AGE_LABELS[input.ageRestriction]);
  }
  return parts.join(' · ');
}
