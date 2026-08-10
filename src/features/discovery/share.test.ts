import { micShareUrl } from './share';

describe('sharing a mic', () => {
  it('links to the universal link that already routes to the mic screen', () => {
    // Must stay in step with web/.well-known and the Android intent filters,
    // which is what makes the shared link open the app rather than a browser,
    // and with web/open-mics/mic/, which is what catches everyone else.
    expect(micShareUrl('abc-123')).toBe(
      'https://www.stonedgooseproductions.com/open-mics/mic/abc-123',
    );
  });
});
