import { formatNextDate, formatNextDateLong, formatRelativeDay } from './date-label';

const LA = 'America/Los_Angeles';
const CHI = 'America/Chicago';

describe('formatNextDate', () => {
  it('says Tonight for an evening show later the same venue day', () => {
    const now = new Date('2026-08-03T20:00:00Z'); // 1 PM in LA
    expect(formatNextDate('2026-08-04T03:00:00Z', LA, now)).toBe('Tonight · 8:00 PM');
  });

  it('says Today for a daytime show the same venue day', () => {
    const now = new Date('2026-08-03T16:00:00Z'); // 9 AM in LA
    expect(formatNextDate('2026-08-03T21:00:00Z', LA, now)).toBe('Today · 2:00 PM');
  });

  it('keeps a post-midnight show Tonight for someone browsing late', () => {
    // 11:30 PM Monday in LA; the mic starts 12:30 AM Tuesday. Same night.
    const now = new Date('2026-08-04T06:30:00Z');
    expect(formatNextDate('2026-08-04T07:30:00Z', LA, now)).toBe('Tonight · 12:30 AM');
  });

  it('holds Tonight across the 11:59 PM boundary', () => {
    const justBefore = new Date('2026-08-04T06:59:00Z'); // Mon 11:59 PM LA
    const justAfter = new Date('2026-08-04T07:01:00Z'); // Tue 12:01 AM LA
    const show = '2026-08-04T08:00:00Z'; // Tue 1:00 AM LA, same night out
    expect(formatNextDate(show, LA, justBefore)).toBe('Tonight · 1:00 AM');
    expect(formatNextDate(show, LA, justAfter)).toBe('Tonight · 1:00 AM');
  });

  it('says Tomorrow for the next night, including its small hours', () => {
    const now = new Date('2026-08-04T02:00:00Z'); // Mon 7 PM LA
    expect(formatNextDate('2026-08-05T03:00:00Z', LA, now)).toBe('Tomorrow · 8:00 PM');
    // Wed 12:30 AM LA belongs to Tuesday night: tomorrow.
    expect(formatNextDate('2026-08-05T07:30:00Z', LA, now)).toBe('Tomorrow · 12:30 AM');
  });

  it('names weekdays two to six nights out', () => {
    const now = new Date('2026-08-03T20:00:00Z'); // Monday afternoon LA
    expect(formatNextDate('2026-08-06T03:00:00Z', LA, now)).toBe('This Wednesday'); // 2 nights
    expect(formatNextDate('2026-08-10T03:00:00Z', LA, now)).toBe('This Sunday'); // 6 nights
  });

  it('falls to absolute dates at seven nights and beyond', () => {
    const now = new Date('2026-08-03T20:00:00Z'); // Monday LA
    expect(formatNextDate('2026-08-11T03:00:00Z', LA, now)).toMatch(/Mon, Aug 10/);
    expect(formatNextDateLong('2026-08-11T03:00:00Z', LA, now)).toMatch(/Monday, August 10/);
  });

  it('uses the venue timezone, not the device, to decide the night', () => {
    // 5:30 AM Aug 4 in Chicago (Tuesday's night has begun) is 3:30 AM in
    // LA (still Monday night). The same instant, Aug 4 evening, is
    // therefore Tonight at a Chicago venue and Tomorrow at an LA one.
    const now = new Date('2026-08-04T10:30:00Z');
    const show = '2026-08-05T02:00:00Z'; // 9 PM Aug 4 Chicago, 7 PM Aug 4 LA
    expect(formatNextDate(show, CHI, now)).toMatch(/^Tonight/);
    expect(formatNextDate(show, LA, now)).toMatch(/^Tomorrow/);
  });

  it('says Tomorrow across the fall DST transition', () => {
    // Oct 31 2026, 8 PM PDT; the show is Nov 1, 8 PM PST (25 hours later).
    const now = new Date('2026-11-01T03:00:00Z');
    expect(formatNextDate('2026-11-02T04:00:00Z', LA, now)).toBe('Tomorrow · 8:00 PM');
  });

  it('drops the time in the day-only form', () => {
    const now = new Date('2026-08-03T20:00:00Z');
    expect(formatRelativeDay('2026-08-04T03:00:00Z', LA, now)).toBe('Tonight');
    expect(formatRelativeDay('2026-08-05T03:00:00Z', LA, now)).toBe('Tomorrow');
    expect(formatRelativeDay('2026-08-06T03:00:00Z', LA, now)).toBe('This Wednesday');
  });

  it('handles a missing date and an unknown zone without crashing', () => {
    expect(formatNextDate(null)).toBe('No upcoming date');
    const now = new Date('2026-08-03T20:00:00Z');
    expect(formatNextDate('2026-08-04T03:00:00Z', 'Not/AZone', now)).toBeTruthy();
  });
});
