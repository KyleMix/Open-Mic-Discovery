import {
  DEFAULT_SIGNUP_OPENS_DAYS,
  SIGNUP_OPENS_CHOICES,
  parseSignupOpensDays,
} from './signup-opens';

describe('parseSignupOpensDays', () => {
  it('reads plural and singular day intervals', () => {
    expect(parseSignupOpensDays('7 days')).toBe(7);
    expect(parseSignupOpensDays('1 day')).toBe(1);
    expect(parseSignupOpensDays('14 days 00:00:00')).toBe(14);
  });

  it('falls back to the default when the interval is missing or odd', () => {
    expect(parseSignupOpensDays(null)).toBe(DEFAULT_SIGNUP_OPENS_DAYS);
    expect(parseSignupOpensDays(undefined)).toBe(DEFAULT_SIGNUP_OPENS_DAYS);
    expect(parseSignupOpensDays('02:00:00')).toBe(DEFAULT_SIGNUP_OPENS_DAYS);
    expect(parseSignupOpensDays('0 days')).toBe(DEFAULT_SIGNUP_OPENS_DAYS);
  });

  it('offers every stored choice as a parseable round trip', () => {
    for (const { days } of SIGNUP_OPENS_CHOICES) {
      expect(parseSignupOpensDays(`${days} days`)).toBe(days);
    }
  });
});
