/**
 * When the producer can run the night from the app.
 *
 * An hour before the door, because that is when a host starts setting up and
 * wants the list in front of them. Not earlier: a screen offering to start a
 * show that is three days away invites a tap that marks the first performer
 * done for a night nobody has attended.
 *
 * It closes six hours after the start time. A mic that began at 8 is over by
 * 2 in the morning, and leaving the controls live indefinitely means a stray
 * tap next week rewrites a list that already happened.
 */
export const LIVE_OPENS_MS = 60 * 60 * 1000;
export const LIVE_CLOSES_MS = 6 * 60 * 60 * 1000;

export type LiveWindow =
  { state: 'too_early'; opensAt: Date } | { state: 'open' } | { state: 'over' };

export function liveWindow(startsAt: string, now: Date): LiveWindow {
  const start = new Date(startsAt).getTime();
  const opens = start - LIVE_OPENS_MS;
  const closes = start + LIVE_CLOSES_MS;
  if (now.getTime() < opens) {
    return { state: 'too_early', opensAt: new Date(opens) };
  }
  if (now.getTime() > closes) {
    return { state: 'over' };
  }
  return { state: 'open' };
}
