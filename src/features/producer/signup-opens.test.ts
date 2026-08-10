import {
  BOOK_AHEAD_SIGNUP_OPENS_CHOICES,
  DEFAULT_BOOK_AHEAD_SIGNUP_OPENS_MINUTES,
  DEFAULT_WALK_IN_SIGNUP_OPENS_MINUTES,
  WALK_IN_SIGNUP_OPENS_CHOICES,
  coerceSignupOpensMinutes,
  defaultSignupOpensMinutes,
  parseSignupOpensMinutes,
  signupOpensChoices,
  signupOpensInterval,
} from './signup-opens';

describe('signup opens choices', () => {
  it('offers times before showtime for a walk-in list', () => {
    expect(signupOpensChoices('first_come')).toBe(WALK_IN_SIGNUP_OPENS_CHOICES);
    // Nothing a day or more out: the sheet goes out at the venue.
    for (const { minutes } of WALK_IN_SIGNUP_OPENS_CHOICES) {
      expect(minutes).toBeLessThan(24 * 60);
    }
  });

  it('offers days ahead for every method that books in advance', () => {
    for (const method of ['lottery', 'reserved_slot', 'host_booked'] as const) {
      expect(signupOpensChoices(method)).toBe(BOOK_AHEAD_SIGNUP_OPENS_CHOICES);
    }
    for (const { minutes } of BOOK_AHEAD_SIGNUP_OPENS_CHOICES) {
      expect(minutes).toBeGreaterThanOrEqual(24 * 60);
    }
  });

  it('defaults to an hour before for walk-in, a week for the rest', () => {
    expect(defaultSignupOpensMinutes('first_come')).toBe(DEFAULT_WALK_IN_SIGNUP_OPENS_MINUTES);
    expect(defaultSignupOpensMinutes('lottery')).toBe(DEFAULT_BOOK_AHEAD_SIGNUP_OPENS_MINUTES);
  });
});

describe('coerceSignupOpensMinutes', () => {
  it('keeps a value the method still offers', () => {
    expect(coerceSignupOpensMinutes(30, 'first_come')).toBe(30);
    expect(coerceSignupOpensMinutes(7 * 24 * 60, 'reserved_slot')).toBe(7 * 24 * 60);
  });

  it('resets a week-long lead time when switching to a walk-in list', () => {
    // The bug this prevents: signups silently opening a week before a mic
    // whose list is written on a clipboard at the door.
    expect(coerceSignupOpensMinutes(7 * 24 * 60, 'first_come')).toBe(
      DEFAULT_WALK_IN_SIGNUP_OPENS_MINUTES,
    );
  });

  it('resets a minutes-long lead time when switching away from a walk-in list', () => {
    expect(coerceSignupOpensMinutes(30, 'reserved_slot')).toBe(
      DEFAULT_BOOK_AHEAD_SIGNUP_OPENS_MINUTES,
    );
  });
});

describe('parseSignupOpensMinutes', () => {
  it('reads day intervals', () => {
    expect(parseSignupOpensMinutes('7 days', 'lottery')).toBe(7 * 24 * 60);
    expect(parseSignupOpensMinutes('1 day', 'lottery')).toBe(24 * 60);
    expect(parseSignupOpensMinutes('14 days 00:00:00', 'lottery')).toBe(14 * 24 * 60);
  });

  it('reads the sub-day intervals a walk-in list stores', () => {
    expect(parseSignupOpensMinutes('01:00:00', 'first_come')).toBe(60);
    expect(parseSignupOpensMinutes('00:30:00', 'first_come')).toBe(30);
    expect(parseSignupOpensMinutes('01:30:00', 'first_come')).toBe(90);
    expect(parseSignupOpensMinutes('03:00:00', 'first_come')).toBe(180);
  });

  it('adds the day and time parts Postgres renders separately', () => {
    expect(parseSignupOpensMinutes('1 day 02:00:00', 'lottery')).toBe(24 * 60 + 120);
  });

  it('falls back to the method default when the interval is missing or odd', () => {
    expect(parseSignupOpensMinutes(null, 'first_come')).toBe(DEFAULT_WALK_IN_SIGNUP_OPENS_MINUTES);
    expect(parseSignupOpensMinutes(undefined, 'lottery')).toBe(
      DEFAULT_BOOK_AHEAD_SIGNUP_OPENS_MINUTES,
    );
    expect(parseSignupOpensMinutes('whenever', 'lottery')).toBe(
      DEFAULT_BOOK_AHEAD_SIGNUP_OPENS_MINUTES,
    );
    expect(parseSignupOpensMinutes('00:00:00', 'first_come')).toBe(
      DEFAULT_WALK_IN_SIGNUP_OPENS_MINUTES,
    );
  });

  it('round trips every offered choice through the stored interval', () => {
    for (const method of ['first_come', 'lottery', 'reserved_slot', 'host_booked'] as const) {
      for (const { minutes } of signupOpensChoices(method)) {
        expect(parseSignupOpensMinutes(signupOpensInterval(minutes), method)).toBe(minutes);
      }
    }
  });

  it('writes whole days as days so daylight saving arithmetic is unchanged', () => {
    // Against a timestamptz, `- interval '7 days'` follows the local clock
    // across a DST change and `- interval '10080 minutes'` does not: the two
    // differ by an hour twice a year. Verified in Postgres:
    //   2026-03-12 19:00 -7 days       => 2026-03-05 19:00
    //   2026-03-12 19:00 -10080 minutes => 2026-03-05 18:00
    expect(signupOpensInterval(7 * 24 * 60)).toBe('7 days');
    expect(signupOpensInterval(24 * 60)).toBe('1 days');
    expect(signupOpensInterval(30 * 24 * 60)).toBe('30 days');
  });

  it('writes sub-day lead times as minutes', () => {
    expect(signupOpensInterval(15)).toBe('15 minutes');
    expect(signupOpensInterval(90)).toBe('90 minutes');
    expect(signupOpensInterval(180)).toBe('180 minutes');
  });

  it('round trips through the format Postgres actually returns', () => {
    // `interval '90 minutes'` comes back as "01:30:00", not "90 minutes".
    expect(parseSignupOpensMinutes('01:30:00', 'first_come')).toBe(90);
    expect(parseSignupOpensMinutes('7 days', 'lottery')).toBe(
      parseSignupOpensMinutes(signupOpensInterval(7 * 24 * 60), 'lottery'),
    );
  });
});

