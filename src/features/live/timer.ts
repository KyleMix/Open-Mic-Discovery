/**
 * The set timer.
 *
 * Silent by design. A host runs this standing at the back of a room with a
 * performer on stage; a chime at the end of a set would land in the middle of
 * someone's punchline. The screen changes colour and the phone taps once in
 * the host's hand, and that is the whole alarm.
 */

export type TimerTone = 'running' | 'nearly' | 'over';

/** The last minute is when a host starts thinking about the wrap-up signal. */
const NEARLY_MS = 60 * 1000;

export function formatClock(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function timerTone(elapsedMs: number, setLengthMinutes: number | null): TimerTone {
  // No agreed set length means there is nothing to be over, so the clock is
  // just a clock.
  if (!setLengthMinutes) {
    return 'running';
  }
  const limit = setLengthMinutes * 60 * 1000;
  if (elapsedMs >= limit) {
    return 'over';
  }
  return elapsedMs >= limit - NEARLY_MS ? 'nearly' : 'running';
}

/**
 * The number on the clock.
 *
 * A host does not care how long someone has been on, they care how long is
 * left of the slot the mic hands out. So the clock counts the allotment down
 * and, once it runs out, counts the overrun up: both are the same question,
 * "how much of the night is this set costing me".
 *
 * With no agreed set length there is nothing to count down from, so it falls
 * back to a plain elapsed clock.
 */
export function clockFace(elapsedMs: number, setLengthMinutes: number | null): string {
  if (!setLengthMinutes) {
    return formatClock(elapsedMs);
  }
  const left = setLengthMinutes * 60 * 1000 - elapsedMs;
  return formatClock(Math.abs(left));
}

/** The line under the clock, which says what the number means. */
export function clockCaption(elapsedMs: number, setLengthMinutes: number | null): string {
  if (!setLengthMinutes) {
    return 'No set length on this mic, so this is just a clock';
  }
  const left = setLengthMinutes * 60 * 1000 - elapsedMs;
  return left >= 0
    ? `left of a ${setLengthMinutes} minute set`
    : `over the ${setLengthMinutes} minute set`;
}
