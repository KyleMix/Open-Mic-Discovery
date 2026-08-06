/**
 * Default list order must bucket each mic by its own local night.
 *
 * `sortSoonestNearest` groups mics by calendar day so that tonight beats
 * tomorrow regardless of distance, then sorts by distance inside a day. It
 * derives that day with getFullYear, getMonth and getDate, which read the
 * host timezone, not the `timezone` column the discovery RPC returns for
 * every mic. A mic's night is therefore decided by where the reader is
 * standing rather than where the mic is.
 *
 * The fixture is two mics at the *same instant* in venue zones sixteen hours
 * apart. That choice matters: identical instants produce an identical
 * host-local date under every possible host timezone, so the current
 * implementation always ties them and falls through to distance, no matter
 * what machine runs the test. The assertions below therefore mean the same
 * thing in UTC, in Los Angeles, and in CI. An earlier version of this file
 * used two different instants and quietly stopped detecting anything when run
 * outside UTC.
 *
 * The two `test.failing` cases state what correct looks like, do not hold
 * today, and turn this file red the moment someone fixes the source, which is
 * the prompt to drop the marker.
 *
 * Smallest change that would make them pass: add `timezone: string` to the
 * `Sortable` type in `order.ts` (the value is already on every row mics_near
 * returns) and compute the bucket in that zone, for example with
 * `Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' })`, which
 * yields a lexically sortable ISO-shaped date.
 */
import { sortSoonestNearest } from './order';

type TestMic = {
  id: string;
  next_starts_at: string | null;
  distance_m: number | null;
  last_confirmed_at: string | null;
  /** IANA zone of the venue, as returned by mics_near. */
  timezone: string;
};

/** The local calendar date at an instant, computed independently of the sort. */
function localDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date(iso));
}

/** One instant, seen from two venues on opposite sides of a date boundary. */
const INSTANT = '2026-07-28T06:00:00Z';

// 23:00 on Monday the 27th in Los Angeles: a mic that is on tonight.
const TONIGHT_IN_LA: TestMic = {
  id: 'tonight-in-la',
  next_starts_at: INSTANT,
  distance_m: 50_000,
  last_confirmed_at: null,
  timezone: 'America/Los_Angeles',
};

// The same moment is 15:00 on Tuesday the 28th in Tokyo: a mic that is on
// tomorrow, and nearer.
const TOMORROW_IN_TOKYO: TestMic = {
  id: 'tomorrow-in-tokyo',
  next_starts_at: INSTANT,
  distance_m: 1_000,
  last_confirmed_at: null,
  timezone: 'Asia/Tokyo',
};

const MICS: TestMic[] = [TOMORROW_IN_TOKYO, TONIGHT_IN_LA];

const order = (mics: TestMic[]): string[] => sortSoonestNearest(mics).map((m) => m.id);

describe('sortSoonestNearest day bucketing', () => {
  it('has a fixture whose two mics share an instant but not a local date', () => {
    // Guards the tests below from going inert if the fixture is edited. The
    // shared instant is what makes them independent of the host timezone, and
    // the differing local dates are what there is to catch.
    expect(TONIGHT_IN_LA.next_starts_at).toBe(TOMORROW_IN_TOKYO.next_starts_at);
    expect(localDate(INSTANT, TONIGHT_IN_LA.timezone)).toBe('2026-07-27');
    expect(localDate(INSTANT, TOMORROW_IN_TOKYO.timezone)).toBe('2026-07-28');
  });

  test.failing('puts the earlier local night first even when it is further away', () => {
    // Monday night in Los Angeles is an earlier night than Tuesday afternoon
    // in Tokyo, so it leads the list. Distance only breaks ties within a
    // night, and these two are not on the same night.
    expect(order(MICS)).toEqual(['tonight-in-la', 'tomorrow-in-tokyo']);
  });

  test.failing('does not merge two different local nights into one bucket', () => {
    // The user visible symptom: "soonest" stops meaning soonest, because a
    // nearer mic on a later night outranks a further mic happening tonight.
    const [first] = sortSoonestNearest(MICS);
    expect(first.id).toBe('tonight-in-la');
  });
});
