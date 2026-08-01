import { buildSocialLinks, handleError, normalizeHandle, normalizeUrl, urlError } from './social';

describe('normalizeHandle', () => {
  it('strips a leading @', () => {
    expect(normalizeHandle('@sage.strings')).toBe('sage.strings');
  });
  it('extracts the handle from a pasted instagram URL', () => {
    expect(normalizeHandle('https://www.instagram.com/sage.strings/')).toBe('sage.strings');
  });
  it('extracts the handle from a pasted tiktok URL with @', () => {
    expect(normalizeHandle('https://tiktok.com/@sagestrings?lang=en')).toBe('sagestrings');
  });
  it('trims whitespace', () => {
    expect(normalizeHandle('  sage  ')).toBe('sage');
  });
});

describe('handleError', () => {
  it('accepts empty (link not set)', () => {
    expect(handleError('')).toBeNull();
  });
  it('accepts a normal handle', () => {
    expect(handleError('sage.strings_99')).toBeNull();
  });
  it('rejects spaces and symbols', () => {
    expect(handleError('sage strings')).not.toBeNull();
    expect(handleError('sage!')).not.toBeNull();
  });
  it('rejects over 30 characters', () => {
    expect(handleError('a'.repeat(31))).not.toBeNull();
  });
});

describe('normalizeUrl', () => {
  it('adds https:// when missing', () => {
    expect(normalizeUrl('sagestrings.com')).toBe('https://sagestrings.com');
  });
  it('upgrades http to https', () => {
    expect(normalizeUrl('http://sagestrings.com')).toBe('https://sagestrings.com');
  });
  it('leaves https URLs alone', () => {
    expect(normalizeUrl('https://youtube.com/@sage')).toBe('https://youtube.com/@sage');
  });
  it('does not rewrite other schemes', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
  it('returns empty for blank input', () => {
    expect(normalizeUrl('   ')).toBe('');
  });
});

describe('urlError', () => {
  it('accepts empty (link not set)', () => {
    expect(urlError('')).toBeNull();
  });
  it('accepts a normal https link', () => {
    expect(urlError('https://sagestrings.com')).toBeNull();
  });
  it('rejects non-https schemes', () => {
    expect(urlError('javascript:alert(1)')).not.toBeNull();
  });
  it('rejects hosts without a dot', () => {
    expect(urlError('https://localhost')).not.toBeNull();
  });
  it('rejects links over 200 characters', () => {
    expect(urlError(`https://example.com/${'a'.repeat(200)}`)).not.toBeNull();
  });
});

describe('buildSocialLinks', () => {
  it('builds full URLs from handles and passes links through', () => {
    expect(
      buildSocialLinks({
        link_instagram: 'sage.strings',
        link_tiktok: 'sagestrings',
        link_youtube: 'https://youtube.com/@sage',
        link_website: null,
      }),
    ).toEqual([
      { key: 'instagram', label: 'Instagram', url: 'https://instagram.com/sage.strings' },
      { key: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/@sagestrings' },
      { key: 'youtube', label: 'YouTube', url: 'https://youtube.com/@sage' },
    ]);
  });
  it('returns nothing when no links are set', () => {
    expect(
      buildSocialLinks({
        link_instagram: null,
        link_tiktok: null,
        link_youtube: null,
        link_website: null,
      }),
    ).toEqual([]);
  });
});
