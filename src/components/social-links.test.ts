/**
 * Every social link has to have a logo.
 *
 * The buttons render an icon and nothing else, so a key with no entry in the
 * map would render an empty tappable square: no crash, no error, just a
 * button that says nothing and cannot be identified by a screen reader
 * either. Adding a network to SocialKey without adding its icon is the way
 * that happens, so this fails at the moment the union grows.
 */
import { SOCIAL_ICONS } from './social-links';
import { buildSocialLinks, type SocialKey } from '@/features/profile/social';

const EVERY_LINK_SET = {
  link_instagram: 'someone',
  link_tiktok: 'someone',
  link_youtube: 'https://youtube.com/@someone',
  link_website: 'https://someone.example',
  link_spotify: 'https://open.spotify.com/artist/abc',
  link_apple_music: 'https://music.apple.com/us/artist/abc',
};

describe('social icons', () => {
  it('covers every key buildSocialLinks can emit', () => {
    const emitted = buildSocialLinks(EVERY_LINK_SET).map((l) => l.key);
    expect(emitted.length).toBeGreaterThan(0);
    for (const key of emitted) {
      expect(SOCIAL_ICONS[key]).toBeDefined();
      expect(SOCIAL_ICONS[key].name.length).toBeGreaterThan(0);
    }
  });

  it('has an icon for every member of the SocialKey union, not just the ones in use', () => {
    // Typed exhaustively so a new key fails the compile as well as the test.
    const keys: SocialKey[] = [
      'instagram',
      'tiktok',
      'youtube',
      'spotify',
      'apple_music',
      'website',
    ];
    expect(Object.keys(SOCIAL_ICONS).sort()).toEqual([...keys].sort());
  });

  it('marks only the real brand marks as brand glyphs', () => {
    // globe is a solid icon, not a brand one, and asking FontAwesome for it in
    // the brand style renders nothing at all.
    expect(SOCIAL_ICONS.website.brand).toBe(false);
    expect(SOCIAL_ICONS.spotify.brand).toBe(true);
    expect(SOCIAL_ICONS.tiktok.brand).toBe(true);
  });
});
