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

/** How far past the agreed length, for the line under the clock. */
export function overBy(elapsedMs: number, setLengthMinutes: number | null): string | null {
  if (!setLengthMinutes) {
    return null;
  }
  const over = elapsedMs - setLengthMinutes * 60 * 1000;
  return over > 0 ? `${formatClock(over)} over` : null;
}
