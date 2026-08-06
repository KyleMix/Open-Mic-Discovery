import { clockCaption, clockFace, formatClock, timerTone } from './timer';
import { liveWindow } from './window';

// 7:00 PM Pacific.
const START = '2026-08-11T02:00:00.000Z';
const at = (iso: string) => new Date(iso);

describe('when a producer can run the night', () => {
  it('opens an hour before the door', () => {
    expect(liveWindow(START, at('2026-08-11T01:00:00.000Z')).state).toBe('open');
    expect(liveWindow(START, at('2026-08-11T00:59:00.000Z')).state).toBe('too_early');
  });

  it('says when it will open, so the host is not left guessing', () => {
    const window = liveWindow(START, at('2026-08-10T12:00:00.000Z'));
    expect(window.state === 'too_early' && window.opensAt.toISOString()).toBe(
      '2026-08-11T01:00:00.000Z',
    );
  });

  it('stays open through the night itself', () => {
    expect(liveWindow(START, at('2026-08-11T04:30:00.000Z')).state).toBe('open');
  });

  it('stays open as long as the show runs, because a clock cannot know', () => {
    // Six hours in, the old rule had taken the controls away mid-show.
    expect(liveWindow(START, at('2026-08-11T09:00:00.000Z')).state).toBe('open');
  });

  it('closes the moment the host says the show is over', () => {
    const window = liveWindow(START, at('2026-08-11T04:30:00.000Z'), '2026-08-11T04:29:00.000Z');
    expect(window.state).toBe('ended');
  });

  it('takes the host at their word over the clock, in both directions', () => {
    // Ended is ended, even ten minutes after the doors opened.
    expect(
      liveWindow(START, at('2026-08-11T02:10:00.000Z'), '2026-08-11T02:09:00.000Z').state,
    ).toBe('ended');
  });

  it('gives up after a day, for the host who forgot to end it', () => {
    // Without this, last week's list stays one tap from being rewritten.
    expect(liveWindow(START, at('2026-08-12T02:01:00.000Z')).state).toBe('over');
    expect(liveWindow(START, at('2026-08-18T02:00:00.000Z')).state).toBe('over');
  });
});

describe('the set timer', () => {
  it('reads as a clock, not a number of seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9_000)).toBe('0:09');
    expect(formatClock(272_000)).toBe('4:32');
    expect(formatClock(725_000)).toBe('12:05');
  });

  it('never shows a negative, whatever it is handed', () => {
    expect(formatClock(-5_000)).toBe('0:00');
  });

  it('warns in the last minute, which is when the wrap-up signal goes out', () => {
    const ten = 10;
    expect(timerTone(8 * 60_000, ten)).toBe('running');
    expect(timerTone(9 * 60_000, ten)).toBe('nearly');
    expect(timerTone(10 * 60_000, ten)).toBe('over');
    expect(timerTone(14 * 60_000, ten)).toBe('over');
  });

  it('is just a clock when no set length was agreed', () => {
    expect(timerTone(45 * 60_000, null)).toBe('running');
    expect(clockFace(45 * 60_000, null)).toBe('45:00');
    expect(clockCaption(45 * 60_000, null)).toMatch(/just a clock/);
  });

  it('counts the allotted set down, not the set up', () => {
    // A host reads "how long is left of the slot", never "how long have they
    // been on".
    expect(clockFace(0, 10)).toBe('10:00');
    expect(clockFace(60_000, 10)).toBe('9:00');
    expect(clockFace(9 * 60_000 + 30_000, 10)).toBe('0:30');
    expect(clockCaption(60_000, 10)).toBe('left of a 10 minute set');
  });

  it('counts the overrun up once the allotment is gone', () => {
    // Which is the number the host has to make up over the rest of the night.
    expect(clockFace(10 * 60_000, 10)).toBe('0:00');
    expect(clockFace(12 * 60_000 + 30_000, 10)).toBe('2:30');
    expect(clockCaption(12 * 60_000, 10)).toBe('over the 10 minute set');
  });
});
