import { describeRecurrence, formatLocalTime } from './recurrence';

describe('describeRecurrence', () => {
  it('renders weekly rules', () => {
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=TU', '20:00')).toBe('Every Tuesday, 8:00 PM');
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=SU', '18:00')).toBe('Every Sunday, 6:00 PM');
  });

  it('renders biweekly and n-weekly rules', () => {
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE', '19:00')).toBe(
      'Every other Wednesday, 7:00 PM',
    );
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=3;BYDAY=MO', '19:30')).toBe(
      'Every 3 weeks on Monday, 7:30 PM',
    );
  });

  it('renders multiple weekdays', () => {
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=MO,WE', '21:00')).toBe(
      'Every Monday and Wednesday, 9:00 PM',
    );
  });

  it('renders monthly ordinals including negatives and pairs', () => {
    expect(describeRecurrence('FREQ=MONTHLY;BYDAY=1FR', '19:30')).toBe(
      'First Friday of the month, 7:30 PM',
    );
    expect(describeRecurrence('FREQ=MONTHLY;BYDAY=-1TH', '19:30')).toBe(
      'Last Thursday of the month, 7:30 PM',
    );
    // A shared weekday is said once.
    expect(describeRecurrence('FREQ=MONTHLY;BYDAY=1SU,3SU', '17:00')).toBe(
      'First and third Sunday of the month, 5:00 PM',
    );
    // Mixed weekdays keep the long form.
    expect(describeRecurrence('FREQ=MONTHLY;BYDAY=1SU,3MO', '17:00')).toBe(
      'First Sunday and third Monday of the month, 5:00 PM',
    );
    // The validator accepts negative ordinals to -5; none may fall back
    // to "Schedule varies".
    expect(describeRecurrence('FREQ=MONTHLY;BYDAY=-2FR', '20:00')).toBe(
      'Second to last Friday of the month, 8:00 PM',
    );
  });

  it('returns null for anything it cannot say confidently', () => {
    expect(describeRecurrence('FREQ=DAILY', '19:00')).toBeNull();
    expect(describeRecurrence('garbage', '19:00')).toBeNull();
    expect(describeRecurrence('FREQ=MONTHLY;BYDAY=XX', '19:00')).toBeNull();
  });

  it('formats times across noon and midnight', () => {
    expect(formatLocalTime('00:15')).toBe('12:15 AM');
    expect(formatLocalTime('12:00')).toBe('12:00 PM');
    expect(formatLocalTime('09:05')).toBe('9:05 AM');
    expect(formatLocalTime('22:30')).toBe('10:30 PM');
  });
});
