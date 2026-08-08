import { imageTransformsEnabled, transformedImageUrl } from './image-url';

const PUBLIC_URL = 'https://abc.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg';

describe('transformedImageUrl', () => {
  const original = process.env.EXPO_PUBLIC_IMAGE_TRANSFORMS_ENABLED;
  afterEach(() => {
    process.env.EXPO_PUBLIC_IMAGE_TRANSFORMS_ENABLED = original;
  });

  it('is off unless the flag is exactly true, so a typo cannot switch it on', () => {
    process.env.EXPO_PUBLIC_IMAGE_TRANSFORMS_ENABLED = 'yes';
    expect(imageTransformsEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_IMAGE_TRANSFORMS_ENABLED = 'true';
    expect(imageTransformsEnabled()).toBe(true);
  });

  describe('with transformations off', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_IMAGE_TRANSFORMS_ENABLED = 'false';
    });

    it('returns the URL untouched, so nothing changes until the flag is flipped', () => {
      expect(transformedImageUrl(PUBLIC_URL, { width: 96 })).toBe(PUBLIC_URL);
    });

    it('still maps null to null', () => {
      expect(transformedImageUrl(null, { width: 96 })).toBeNull();
    });
  });

  describe('with transformations on', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_IMAGE_TRANSFORMS_ENABLED = 'true';
    });

    it('rewrites the object path to the render path', () => {
      const url = transformedImageUrl(PUBLIC_URL, { width: 96 });
      expect(url).toContain('/storage/v1/render/image/public/avatars/user-1/avatar.jpg');
      expect(url).not.toContain('/storage/v1/object/public/');
    });

    it('carries width, resize and a default quality', () => {
      const url = new URL(transformedImageUrl(PUBLIC_URL, { width: 96 })!);
      expect(url.searchParams.get('width')).toBe('96');
      expect(url.searchParams.get('resize')).toBe('cover');
      expect(url.searchParams.get('quality')).toBe('75');
      expect(url.searchParams.get('height')).toBeNull();
    });

    it('rounds fractional sizes, because a device pixel ratio produces them', () => {
      const url = new URL(transformedImageUrl(PUBLIC_URL, { width: 96.4, height: 32.6 })!);
      expect(url.searchParams.get('width')).toBe('96');
      expect(url.searchParams.get('height')).toBe('33');
    });

    it('keeps the cache-busting version the upload helpers append', () => {
      // Without this, replacing an avatar would keep showing the previous image
      // until the CDN expired it, which is the bug the ?v= exists to prevent.
      const url = new URL(transformedImageUrl(`${PUBLIC_URL}?v=1234567890`, { width: 96 })!);
      expect(url.searchParams.get('v')).toBe('1234567890');
      expect(url.searchParams.get('width')).toBe('96');
    });

    it('leaves a URL that is already transformed alone', () => {
      const already =
        'https://abc.supabase.co/storage/v1/render/image/public/avatars/user-1/avatar.jpg?width=96';
      expect(transformedImageUrl(already, { width: 32 })).toBe(already);
    });

    it('leaves an externally hosted image alone rather than mangling it', () => {
      const external = 'https://example.com/someones-photo.jpg';
      expect(transformedImageUrl(external, { width: 96 })).toBe(external);
    });

    it('maps null and undefined to null', () => {
      expect(transformedImageUrl(null, { width: 96 })).toBeNull();
      expect(transformedImageUrl(undefined, { width: 96 })).toBeNull();
    });
  });
});
