import { formatClock, overBy, timerTone } from './timer';
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

  it('closes once the night is long over', () => {
    // A stray tap the following week must not rewrite a list that happened.
    expect(liveWindow(START, at('2026-08-11T08:01:00.000Z')).state).toBe('over');
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
    expect(overBy(45 * 60_000, null)).toBeNull();
  });

  it('says how far over, because that is what the host has to make up', () => {
    expect(overBy(12 * 60_000 + 30_000, 10)).toBe('2:30 over');
    expect(overBy(9 * 60_000, 10)).toBeNull();
  });
});
