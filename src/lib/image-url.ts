/**
 * Supabase Storage image transformations, applied at render time.
 *
 * Why at render and not at upload: the public URL is stored in the database
 * (`profiles.avatar_url`, `mic_series.poster_url`) when the file is uploaded, and
 * the same stored URL is rendered at several sizes. An avatar appears at 32px on
 * a roster row and 96px on a profile header; a poster is a card thumbnail in
 * Discover and full width on the mic page. Baking one size into the stored value
 * would pick the wrong one everywhere else.
 *
 * The transformation is a URL rewrite, so this is a pure function with no
 * Supabase client and no network call:
 *
 *   /storage/v1/object/public/avatars/<uid>/avatar.jpg
 *   /storage/v1/render/image/public/avatars/<uid>/avatar.jpg?width=96&...
 *
 * Off by default. Transformations may not be available on every Supabase plan,
 * and this environment cannot check which: if the render endpoint is not
 * available the images would simply fail to load, so the flag stays off until
 * somebody confirms it works against the real project. See docs/admin/SECRETS.md
 * and the note in ARCHITECTURE.md.
 */

const OBJECT_SEGMENT = '/storage/v1/object/public/';
const RENDER_SEGMENT = '/storage/v1/render/image/public/';

export type ImageTransform = {
  /** Rendered width in device-independent pixels. */
  width: number;
  /** Rendered height. Omit for width-only scaling. */
  height?: number;
  /** Defaults to `cover`, which is what every call site here wants. */
  resize?: 'cover' | 'contain' | 'fill';
  /** 20 to 100. Defaults to 75, which is invisible against a photo. */
  quality?: number;
};

/** True when the project has confirmed Storage transformations are available. */
export function imageTransformsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_IMAGE_TRANSFORMS_ENABLED === 'true';
}

/**
 * Rewrites a Supabase public object URL into a transformed one.
 *
 * Returns the input unchanged when transformations are switched off, when the
 * URL is not a Supabase public object URL (an externally hosted image, or a row
 * written before the bucket layout settled), or when it is already a render URL.
 * Never throws: a broken image URL should render a broken image, not crash a
 * screen.
 */
export function transformedImageUrl(
  url: string | null | undefined,
  transform: ImageTransform,
): string | null {
  if (!url) {
    return null;
  }
  if (!imageTransformsEnabled()) {
    return url;
  }
  if (url.includes(RENDER_SEGMENT)) {
    return url;
  }
  const at = url.indexOf(OBJECT_SEGMENT);
  if (at === -1) {
    return url;
  }

  // Keep any existing query string. The upload helpers append `?v=<timestamp>`
  // as a cache buster, and dropping it would leave a replaced avatar showing the
  // previous image until the CDN expired it.
  const [path, existingQuery] = url.slice(at + OBJECT_SEGMENT.length).split('?', 2);
  const params = new URLSearchParams(existingQuery);
  params.set('width', String(Math.round(transform.width)));
  if (transform.height !== undefined) {
    params.set('height', String(Math.round(transform.height)));
  }
  params.set('resize', transform.resize ?? 'cover');
  params.set('quality', String(transform.quality ?? 75));

  return `${url.slice(0, at)}${RENDER_SEGMENT}${path}?${params.toString()}`;
}
