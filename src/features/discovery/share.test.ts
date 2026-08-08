import { micShareMessage, micShareUrl } from './share';

const MIC = {
  series_id: 'abc-123',
  title: 'The Log Cabin',
  venue_name: 'The Log Cabin',
  next_starts_at: '2026-08-11T02:00:00.000Z',
  timezone: 'America/Los_Angeles',
};

describe('sharing a mic', () => {
  it('links to the universal link that already routes to the mic screen', () => {
    // Must stay in step with web/.well-known and the Android intent filters,
    // which is what makes the shared link open the app rather than a browser.
    expect(micShareUrl('abc-123')).toBe('https://stonedgoose.com/openmic/mic/abc-123');
  });

  it('says what the mic is, so the message stands on its own', () => {
    // Most messengers cannot render a preview for this link, so the text has
    // to answer "what is this" without the recipient tapping anything.
    const message = micShareMessage(MIC);
    expect(message).toContain('The Log Cabin');
    expect(message).toContain('Mon, Aug 10');
    expect(message).toContain('https://stonedgoose.com/openmic/mic/abc-123');
  });

  it('drops the parts it does not have rather than printing null', () => {
    const message = micShareMessage({
      ...MIC,
      venue_name: null,
      next_starts_at: null,
    });
    expect(message).toBe('The Log Cabin\nhttps://stonedgoose.com/openmic/mic/abc-123');
  });

  it('renders the date in the venue timezone, not the reader one', () => {
    // 2:00 UTC is still the 10th in Los Angeles and already the 11th in London.
    expect(micShareMessage(MIC)).toContain('Aug 10');
    expect(micShareMessage({ ...MIC, timezone: 'Europe/London' })).toContain('Aug 11');
  });
});
