import { LEGAL_LINKS, openLegalLink } from './links';

describe('openLegalLink', () => {
  it('opens the page in the in-app browser when reachable', async () => {
    const open = jest.fn().mockResolvedValue(undefined);
    const probe = jest.fn().mockResolvedValue(undefined);
    const result = await openLegalLink(LEGAL_LINKS.privacyPolicy.url, open, probe);
    expect(result).toBeNull();
    expect(open).toHaveBeenCalledWith(LEGAL_LINKS.privacyPolicy.url);
  });

  it('returns a friendly message instead of a dead end when offline', async () => {
    const open = jest.fn();
    const probe = jest.fn().mockRejectedValue(new Error('network request failed'));
    const result = await openLegalLink(LEGAL_LINKS.termsOfUse.url, open, probe);
    expect(result).toBe('That page needs a connection. Check your network and try again.');
    expect(open).not.toHaveBeenCalled();
  });

  it('reports a failure to open without throwing', async () => {
    const open = jest.fn().mockRejectedValue(new Error('no browser'));
    const probe = jest.fn().mockResolvedValue(undefined);
    const result = await openLegalLink(LEGAL_LINKS.termsOfUse.url, open, probe);
    expect(result).toBe('Could not open the page. Try again.');
  });
});
