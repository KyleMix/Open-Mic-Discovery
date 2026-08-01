import {
  BOOK_AHEAD_SIGNUP_OPENS_CHOICES,
  parseSignupOpensMinutes,
  signupOpensInterval,
  WALK_IN_SIGNUP_OPENS_CHOICES,
} from '@/features/producer/signup-opens';

import { parseIntervalMs, signupOpensClockTime, signupWindow } from './window';

const DAY = 24 * 60 * 60 * 1000;

describe('parseIntervalMs', () => {
  it('parses day intervals', () => {
    expect(parseIntervalMs('7 days')).toBe(7 * DAY);
    expect(parseIntervalMs('1 day')).toBe(DAY);
  });
  it('parses time intervals', () => {
    expect(parseIntervalMs('02:00:00')).toBe(2 * 3600 * 1000);
    expect(parseIntervalMs('00:30:00')).toBe(30 * 60 * 1000);
  });
  it('parses combined intervals and zero', () => {
    expect(parseIntervalMs('1 day 02:30:00')).toBe(DAY + 2.5 * 3600 * 1000);
    expect(parseIntervalMs('00:00:00')).toBe(0);
  });
});

describe('signupWindow', () => {
  const startsAt = '2026-08-04T03:00:00Z';

  it('is not yet open before the opens offset', () => {
    const result = signupWindow(startsAt, '7 days', '00:00:00', new Date('2026-07-20T00:00:00Z'));
    expect(result.state).toBe('not_yet');
  });

  it('is open inside the window', () => {
    const result = signupWindow(startsAt, '7 days', '00:00:00', new Date('2026-08-01T00:00:00Z'));
    expect(result.state).toBe('open');
  });

  it('closes at the close offset before start', () => {
    const result = signupWindow(startsAt, '7 days', '02:00:00', new Date('2026-08-04T02:00:00Z'));
    expect(result.state).toBe('closed');
  });

  it('closes at showtime when the close offset is zero', () => {
    expect(
      signupWindow(startsAt, '7 days', '00:00:00', new Date('2026-08-04T02:59:00Z')).state,
    ).toBe('open');
    expect(
      signupWindow(startsAt, '7 days', '00:00:00', new Date('2026-08-04T03:01:00Z')).state,
    ).toBe('closed');
  });
});

describe('signupOpensClockTime', () => {
  it('subtracts a sub-day lead time from the local start time', () => {
    expect(signupOpensClockTime('19:00:00', '01:00:00')).toEqual({
      time: '6:00 PM',
      dayBefore: false,
    });
    expect(signupOpensClockTime('19:00:00', '00:30:00')).toEqual({
      time: '6:30 PM',
      dayBefore: false,
    });
    expect(signupOpensClockTime('19:00:00', '03:00:00')).toEqual({
      time: '4:00 PM',
      dayBefore: false,
    });
  });

  it('renders noon and midnight the way a reader expects', () => {
    expect(signupOpensClockTime('13:00:00', '01:00:00').time).toBe('12:00 PM');
    expect(signupOpensClockTime('01:00:00', '01:00:00').time).toBe('12:00 AM');
  });

  it('flags a lead time that crosses back over midnight', () => {
    // A 12:30 AM show opening 3 hours early opens the previous evening.
    expect(signupOpensClockTime('00:30:00', '03:00:00')).toEqual({
      time: '9:30 PM',
      dayBefore: true,
    });
  });
});

describe('the two interval parsers agree on the same column', () => {
  // signup_opens is written by producer/signup-opens.ts and read by both that
  // module and this one. They had separate parsers, and this one returned 0
  // for the minute literals the other one writes. Zero reads as "opens at
  // showtime", which hides the Sign up button for the whole window. Reading
  // from the database Postgres normalizes to the clock form so it never bit,
  // but nothing stopped a caller handing over the written form.
  const everyChoice = [...WALK_IN_SIGNUP_OPENS_CHOICES, ...BOOK_AHEAD_SIGNUP_OPENS_CHOICES];

  it('reads back every lead time the producer form can write', () => {
    for (const choice of everyChoice) {
      const written = signupOpensInterval(choice.minutes);
      expect(parseIntervalMs(written) / 60_000).toBe(choice.minutes);
      // And the sibling parser, on the same string, reaches the same answer.
      expect(parseSignupOpensMinutes(written, 'first_come')).toBe(choice.minutes);
    }
  });

  it('reads the clock form Postgres renders back', () => {
    expect(parseIntervalMs('00:15:00') / 60_000).toBe(15);
    expect(parseIntervalMs('01:30:00') / 60_000).toBe(90);
    expect(parseIntervalMs('03:00:00') / 60_000).toBe(180);
    expect(parseIntervalMs('7 days') / 60_000).toBe(7 * 24 * 60);
  });

  it('does not count the hours twice on a mixed interval', () => {
    // "1 day 02:30:00" carries both parts; reading the 02 as hours as well
    // would add them on top of the clock part.
    expect(parseIntervalMs('1 day 02:30:00') / 60_000).toBe(24 * 60 + 150);
  });

  it('treats zero as zero rather than as unparseable', () => {
    expect(parseIntervalMs('00:00:00')).toBe(0);
  });
});
