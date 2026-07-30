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
