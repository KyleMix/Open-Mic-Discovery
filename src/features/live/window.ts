/**
 * When the producer can run the night from the app.
 *
 * An hour before the door, because that is when a host starts setting up and
 * wants the list in front of them. Not earlier: a screen offering to start a
 * show that is three days away invites a tap that marks the first performer
 * done for a night nobody has attended.
 *
 * It stays open until the host ends the show. A clock cannot know when a mic
 * finishes: a night that runs long would have taken the controls away
 * mid-show, and one that wraps early would have left them open for hours. The
 * host knows, so the host says.
 *
 * The day-long backstop is only there for the host who forgets. Without it,
 * last week's list stays one tap from being rewritten forever.
 */
export const LIVE_OPENS_MS = 60 * 60 * 1000;
export const LIVE_BACKSTOP_MS = 24 * 60 * 60 * 1000;

export type LiveWindow =
  | { state: 'too_early'; opensAt: Date }
  | { state: 'open' }
  | { state: 'ended'; endedAt: Date }
  | { state: 'over' };

export function liveWindow(startsAt: string, now: Date, liveEndedAt?: string | null): LiveWindow {
  // The host's own word beats every clock here, in both directions: a show
  // ended is ended even if it started ten minutes ago.
  if (liveEndedAt) {
    return { state: 'ended', endedAt: new Date(liveEndedAt) };
  }
  const start = new Date(startsAt).getTime();
  const opens = start - LIVE_OPENS_MS;
  if (now.getTime() < opens) {
    return { state: 'too_early', opensAt: new Date(opens) };
  }
  if (now.getTime() > start + LIVE_BACKSTOP_MS) {
    return { state: 'over' };
  }
  return { state: 'open' };
}
