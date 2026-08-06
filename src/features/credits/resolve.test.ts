import { creditFor, creditName, isOverridden, type Credit } from './resolve';

function credit(over: Partial<Credit>): Credit {
  return {
    id: 'credit-1',
    series_id: 'series-1',
    occurrence_id: null,
    role: 'host',
    profile_id: null,
    handle: null,
    avatar_url: null,
    name: null,
    link_instagram: null,
    link_tiktok: null,
    link_youtube: null,
    link_website: null,
    link_spotify: null,
    link_apple_music: null,
    ...over,
  };
}

const SERIES_HOST = credit({ id: 'a', role: 'host', name: 'Regular Host' });
const NIGHT_HOST = credit({
  id: 'b',
  role: 'host',
  occurrence_id: 'night-2',
  name: 'Guest Host',
});
const SERIES_FEATURE = credit({ id: 'c', role: 'featured', name: 'Usual Feature' });

describe('creditFor', () => {
  it('falls back to the series default on a night with no override', () => {
    expect(creditFor([SERIES_HOST, NIGHT_HOST], 'host', 'night-1')?.name).toBe('Regular Host');
  });

  it('prefers the night when that night has its own', () => {
    expect(creditFor([SERIES_HOST, NIGHT_HOST], 'host', 'night-2')?.name).toBe('Guest Host');
  });

  it('gives the series default when no night is being asked about', () => {
    expect(creditFor([SERIES_HOST, NIGHT_HOST], 'host')?.name).toBe('Regular Host');
  });

  it('keeps the roles apart', () => {
    expect(creditFor([SERIES_HOST, SERIES_FEATURE], 'featured')?.name).toBe('Usual Feature');
  });

  it('returns nothing when the role is not credited at all', () => {
    expect(creditFor([SERIES_HOST], 'featured', 'night-1')).toBeNull();
  });

  it('uses a night override even when the series has no default', () => {
    // A one-off guest on a series that normally names nobody.
    expect(creditFor([NIGHT_HOST], 'host', 'night-2')?.name).toBe('Guest Host');
  });

  it('does not leak one night override onto another night', () => {
    expect(creditFor([NIGHT_HOST], 'host', 'night-3')).toBeNull();
  });
});

describe('isOverridden', () => {
  it('is true only for the night that actually differs', () => {
    expect(isOverridden([SERIES_HOST, NIGHT_HOST], 'host', 'night-2')).toBe(true);
    expect(isOverridden([SERIES_HOST, NIGHT_HOST], 'host', 'night-1')).toBe(false);
  });

  it('is false when no night is in question', () => {
    expect(isOverridden([SERIES_HOST, NIGHT_HOST], 'host', null)).toBe(false);
  });
});

describe('creditName', () => {
  it('prefers the resolved name', () => {
    expect(creditName(credit({ name: 'Marla Quinn', handle: 'marla' }))).toBe('Marla Quinn');
  });

  it('falls back to the handle when a linked profile has no stage name', () => {
    expect(creditName(credit({ name: null, handle: 'marla' }))).toBe('@marla');
  });

  it('says something rather than nothing when a linked account stopped resolving', () => {
    // Deleted, held for moderation, or blocked: the view returns the row with
    // its profile fields null. A blank line on the listing would read as a bug.
    expect(creditName(credit({ name: null, handle: null }))).toBe('To be announced');
  });

  it('ignores whitespace-only names', () => {
    expect(creditName(credit({ name: '   ', handle: 'marla' }))).toBe('@marla');
  });
});
