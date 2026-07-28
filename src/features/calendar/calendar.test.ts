import { googleCalendarUrl } from './calendar';

describe('googleCalendarUrl', () => {
  it('builds a template URL with UTC stamps and encoded fields', () => {
    const url = googleCalendarUrl({
      title: 'Rusty Fret Open Mic',
      startsAt: new Date('2026-08-04T03:00:00.000Z'),
      endsAt: new Date('2026-08-04T06:00:00.000Z'),
      location: 'The Rusty Fret, 1234 Pike St, Seattle',
      notes: 'Two songs or ten minutes. Added from Open Mic Finder.',
    });
    expect(url).toContain('https://calendar.google.com/calendar/render?');
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('dates=20260804T030000Z%2F20260804T060000Z');
    expect(url).toContain('text=Rusty+Fret+Open+Mic');
    expect(url).toContain('location=The+Rusty+Fret');
  });
});
