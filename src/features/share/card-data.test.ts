import { buildCardModel, type ShareCardMic } from './card-data';

const MIC: ShareCardMic = {
  series_id: 'abc-123',
  title: 'Velvet Antler Comedy Open Mic',
  rrule: 'FREQ=WEEKLY;BYDAY=WE',
  start_time: '21:00',
  timezone: 'America/Los_Angeles',
  signup_method: 'first_come',
  signup_closes: '02:00:00',
  cost_cents: 0,
  disciplines: ['comedy'],
  venue_name: 'The Velvet Antler',
  neighborhood: 'Capitol Hill',
  city: 'Seattle',
  next_starts_at: '2026-08-13T04:00:00.000Z',
  poster_url: null,
};

describe('the share card model', () => {
  it('leads with the concrete night for a weekly mic', () => {
    const model = buildCardModel(MIC);
    expect(model.eyebrow).toBe('WEDNESDAY, AUG 12');
    expect(model.meta).toBe('Signups close 7:00 PM · Show 9:00 PM');
    expect(model.place).toBe('Capitol Hill, Seattle');
    expect(model.discipline).toBe('COMEDY');
  });

  it('keeps a monthly mic’s identity in the eyebrow', () => {
    const model = buildCardModel({
      ...MIC,
      rrule: 'FREQ=MONTHLY;BYDAY=1FR',
      start_time: '19:30',
      next_starts_at: '2026-09-05T02:30:00.000Z',
    });
    expect(model.eyebrow).toBe('FIRST FRIDAY · NEXT: SEP 4');
  });

  it('falls back to the cadence when no night is scheduled', () => {
    expect(buildCardModel({ ...MIC, next_starts_at: null }).eyebrow).toBe('EVERY WEDNESDAY');
    expect(buildCardModel({ ...MIC, next_starts_at: null, rrule: 'FREQ=DAILY' }).eyebrow).toBe(
      'OPEN MIC NIGHT',
    );
  });

  it('speaks each signup method in its own words', () => {
    expect(
      buildCardModel({ ...MIC, signup_method: 'lottery', signup_closes: '30 minutes' }).meta,
    ).toBe('Name draw 8:30 PM · Show 9:00 PM');
    expect(buildCardModel({ ...MIC, signup_method: 'host_booked' }).meta).toBe('Show 9:00 PM');
    expect(buildCardModel({ ...MIC, cost_cents: 500 }).meta).toBe(
      'Signups close 7:00 PM · Show 9:00 PM · $5',
    );
  });

  it('never lets a database-length name reach the canvas untrimmed', () => {
    const model = buildCardModel({
      ...MIC,
      title: 'T'.repeat(120),
      venue_name: 'V'.repeat(120),
    });
    expect(model.title.length).toBeLessThanOrEqual(64);
    expect(model.title.endsWith('…')).toBe(true);
    expect(model.venue!.length).toBeLessThanOrEqual(44);
  });

  it('handles the empty mic without inventing text', () => {
    const model = buildCardModel({
      ...MIC,
      venue_name: null,
      neighborhood: null,
      city: null,
      next_starts_at: null,
      signup_closes: null,
      poster_url: null,
    });
    expect(model.venue).toBeNull();
    expect(model.place).toBeNull();
    expect(model.meta).toBe('Show 9:00 PM');
  });

  it('labels a mixed bill as variety with the neutral accent', () => {
    const model = buildCardModel({ ...MIC, disciplines: ['music', 'comedy', 'poetry'] });
    expect(model.discipline).toBe('VARIETY');
  });

  it('carries the universal link for the QR code', () => {
    expect(buildCardModel(MIC).shareUrl).toBe(
      'https://www.stonedgooseproductions.com/open-mics/mic/abc-123',
    );
  });
});
