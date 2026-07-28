/**
 * Social link normalization. People paste whatever they have: a bare
 * handle, "@handle", or a full profile URL. Handles are stored bare and
 * URLs stored as https links, matching the database check constraints, so
 * every accepted value here is also accepted by the server.
 */

const HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

/** Strips @, whitespace, and a pasted instagram/tiktok URL down to the handle. */
export function normalizeHandle(input: string): string {
  let value = input.trim();
  value = value.replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\//i, '');
  value = value.replace(/^@/, '');
  value = value.replace(/[/?#].*$/, '');
  return value;
}

/** Null when fine, otherwise a message the person can act on. */
export function handleError(normalized: string): string | null {
  if (normalized.length === 0) {
    return null;
  }
  if (!HANDLE_PATTERN.test(normalized)) {
    return 'Use just the username: letters, numbers, dots, underscores.';
  }
  return null;
}

/** Trims and adds https:// when the scheme was left off. */
export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (value.length === 0) {
    return '';
  }
  if (/^https:\/\//i.test(value)) {
    return value;
  }
  if (/^http:\/\//i.test(value)) {
    return value.replace(/^http:\/\//i, 'https://');
  }
  if (/^[a-z]+:/i.test(value)) {
    // Some other scheme (javascript:, ftp:); never silently rewrite those.
    return value;
  }
  return `https://${value}`;
}

export function urlError(normalized: string): string | null {
  if (normalized.length === 0) {
    return null;
  }
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(normalized)) {
    return 'Enter a full link, like https://example.com';
  }
  if (normalized.length > 200) {
    return 'That link is too long.';
  }
  return null;
}

export type SocialLink = {
  key: 'instagram' | 'tiktok' | 'youtube' | 'website';
  label: string;
  url: string;
};

type SocialColumns = {
  link_instagram: string | null;
  link_tiktok: string | null;
  link_youtube: string | null;
  link_website: string | null;
};

/** Tappable links for a profile, in display order. Empty fields drop out. */
export function buildSocialLinks(profile: SocialColumns): SocialLink[] {
  const links: SocialLink[] = [];
  if (profile.link_instagram) {
    links.push({
      key: 'instagram',
      label: 'Instagram',
      url: `https://instagram.com/${profile.link_instagram}`,
    });
  }
  if (profile.link_tiktok) {
    links.push({
      key: 'tiktok',
      label: 'TikTok',
      url: `https://www.tiktok.com/@${profile.link_tiktok}`,
    });
  }
  if (profile.link_youtube) {
    links.push({ key: 'youtube', label: 'YouTube', url: profile.link_youtube });
  }
  if (profile.link_website) {
    links.push({ key: 'website', label: 'Website', url: profile.link_website });
  }
  return links;
}
