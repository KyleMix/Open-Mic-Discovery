import { CAPTION_MAX, shareCaption, type CaptionMic } from './captions';
import { cadence, closesClockTime, relativeDayPhrase } from './format';

// A Wednesday-night comedy mic, next night Wed Aug 12 2026 9:00 PM Pacific.
const MIC: CaptionMic = {
  series_id: 'abc-123',
  title: 'Velvet Antler Comedy Open Mic',
  rrule: 'FREQ=WEEKLY;BYDAY=WE',
  start_time: '21:00',
  timezone: 'America/Los_Angeles',
  signup_method: 'first_come',
  signup_closes: '2 hours',
  cost_cents: 0,
  disciplines: ['comedy'],
  venue_name: 'The Velvet Antler',
  neighborhood: 'Capitol Hill',
  city: 'Seattle',
  next_starts_at: '2026-08-13T04:00:00.000Z',
};

// A Monday two days out, so relative phrasing stays in "this Wednesday" land.
const NOW = new Date('2026-08-10T19:00:00.000Z');

const LINK = 'https://www.stonedgooseproductions.com/open-mics/mic/abc-123';

describe('performer caption', () => {
  it('reads as a person announcing their set, with the link last', () => {
    expect(shareCaption(MIC, 'performer', NOW)).toBe(
      `I'm on the lineup at Velvet Antler Comedy Open Mic this Wednesday at The Velvet Antler in Capitol Hill. Show at 9:00 PM. Come out.\n${LINK}`,
    );
  });

  it('drops missing fields without leaving grammar debris', () => {
    const bare = shareCaption(
      { ...MIC, venue_name: null, neighborhood: null, city: null, next_starts_at: null },
      'performer',
      NOW,
    );
    expect(bare).toBe(
      `I'm on the lineup at Velvet Antler Comedy Open Mic. Show at 9:00 PM. Come out.\n${LINK}`,
    );
    expect(bare).not.toMatch(/ {2}| at\.| in\.| on\./);
  });

  it('falls back to city when the venue has no neighborhood', () => {
    expect(shareCaption({ ...MIC, neighborhood: null }, 'performer', NOW)).toContain('in Seattle');
  });
});

describe('producer caption', () => {
  it('carries cadence, next date, and the signup window', () => {
    expect(shareCaption(MIC, 'producer', NOW)).toBe(
      `Velvet Antler Comedy Open Mic at The Velvet Antler, Seattle. Every Wednesday, next one Aug 12. Signups close 7:00 PM, show 9:00 PM. All levels welcome, spots go fast.\n${LINK}`,
    );
  });

  it('says a lottery like a lottery', () => {
    expect(
      shareCaption(
        { ...MIC, signup_method: 'lottery', signup_closes: '30 minutes' },
        'producer',
        NOW,
      ),
    ).toContain('Name draw 8:30 PM, show 9:00 PM.');
  });

  it('does not invite signups to a host-booked lineup', () => {
    const caption = shareCaption({ ...MIC, signup_method: 'host_booked' }, 'producer', NOW);
    expect(caption).not.toContain('Signups');
    expect(caption).not.toContain('spots go fast');
  });

  it('survives the no-signup-time, null-city night', () => {
    const caption = shareCaption(
      { ...MIC, signup_closes: null, city: null, next_starts_at: null },
      'producer',
      NOW,
    );
    expect(caption).toBe(
      `Velvet Antler Comedy Open Mic at The Velvet Antler. Every Wednesday. Signups in the app, show 9:00 PM. All levels welcome, spots go fast.\n${LINK}`,
    );
  });
});

describe('neutral caption', () => {
  it('names the discipline when there is one', () => {
    expect(shareCaption(MIC, 'neutral', NOW)).toBe(
      `Live comedy at The Velvet Antler in Seattle on Aug 12. Free to watch, sign up if you want the mic.\n${LINK}`,
    );
  });

  it('calls a mixed bill an open mic and a paid door what it is', () => {
    const caption = shareCaption(
      { ...MIC, disciplines: ['music', 'comedy'], cost_cents: 500 },
      'neutral',
      NOW,
    );
    expect(caption).toContain('An open mic at');
    expect(caption).toContain('Come watch, sign up');
  });
});

describe('caption rules', () => {
  const intents = ['performer', 'producer', 'neutral'] as const;

  it('stays under 280 characters even with a maximum-length title', () => {
    const longest = {
      ...MIC,
      // The schema allows 120 characters; nothing real is this long yet.
      title:
        'The Absolutely Unabridged Full Length Open Microphone Extravaganza and Songwriter Showcase of Greater Puget Sound Region'.slice(
          0,
          120,
        ),
      venue_name: 'The Extraordinarily Long Named Public House and Performance Venue'.slice(0, 120),
    };
    for (const intent of intents) {
      const caption = shareCaption(longest, intent, NOW);
      expect(caption.length).toBeLessThanOrEqual(CAPTION_MAX);
      expect(caption).toContain(LINK);
    }
  });

  it('contains no em dashes and no null artifacts', () => {
    for (const intent of intents) {
      const caption = shareCaption(MIC, intent, NOW);
      expect(caption).not.toContain('—');
      expect(caption).not.toMatch(/null|undefined/);
    }
  });

  it('renders the date in the venue timezone, not the reader one', () => {
    // 4:00 UTC on the 13th is still Wednesday the 12th in Los Angeles.
    expect(shareCaption(MIC, 'neutral', NOW)).toContain('Aug 12');
    expect(shareCaption({ ...MIC, timezone: 'Europe/London' }, 'neutral', NOW)).toContain('Aug 13');
  });
});

describe('format helpers', () => {
  it('speaks relative days like a person', () => {
    const tz = 'America/Los_Angeles';
    const showIso = '2026-08-13T04:00:00.000Z';
    expect(relativeDayPhrase(showIso, tz, new Date('2026-08-12T20:00:00.000Z'))).toBe('tonight');
    expect(relativeDayPhrase(showIso, tz, new Date('2026-08-11T20:00:00.000Z'))).toBe('tomorrow');
    expect(relativeDayPhrase(showIso, tz, NOW)).toBe('this Wednesday');
    expect(relativeDayPhrase(showIso, tz, new Date('2026-08-01T20:00:00.000Z'))).toBe(
      'Wednesday, Aug 12',
    );
  });

  it('derives the closing clock time across midnight', () => {
    // A 12:30 AM show closing 3 hours ahead closes at 9:30 PM the evening before.
    expect(closesClockTime('00:30', '3 hours')).toBe('9:30 PM');
    expect(closesClockTime('21:00', '02:00:00')).toBe('7:00 PM');
    expect(closesClockTime('21:00', '0')).toBeNull();
    expect(closesClockTime('21:00', null)).toBeNull();
    // A whole-day lead would print a clock time that reads as show day.
    expect(closesClockTime('19:30', '1 day')).toBeNull();
  });

  it('strips the clock time from a cadence but keeps the words', () => {
    expect(cadence('FREQ=WEEKLY;BYDAY=WE', '21:00')).toBe('Every Wednesday');
    expect(cadence('FREQ=MONTHLY;BYDAY=1FR', '19:30')).toBe('First Friday of the month');
    expect(cadence('FREQ=DAILY', '19:30')).toBeNull();
  });
});
