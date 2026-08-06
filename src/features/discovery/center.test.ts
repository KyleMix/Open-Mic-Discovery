import { resolveDiscoverCenter, SEATTLE_FALLBACK_NOTE } from './center';
import { DEFAULT_CENTER } from './location';

describe('resolveDiscoverCenter (reviewer cold start)', () => {
  const device = { lat: 40.7128, lng: -74.006 };
  const home = { lat: 45.5152, lng: -122.6784 };

  it('prefers the device position from the locate tap', () => {
    expect(resolveDiscoverCenter(device, home)).toEqual({ ...device, source: 'device' });
  });

  it('falls back to the profile home area', () => {
    expect(resolveDiscoverCenter(null, home)).toEqual({ ...home, source: 'home' });
  });

  it('defaults to seeded Seattle when location is denied and no home area exists', () => {
    expect(resolveDiscoverCenter(null, null)).toEqual({
      ...DEFAULT_CENTER,
      source: 'seattle_fallback',
    });
  });

  it('marks only the true fallback so the affordance never shows over real data', () => {
    expect(resolveDiscoverCenter(null, home).source).not.toBe('seattle_fallback');
    expect(resolveDiscoverCenter(device, null).source).not.toBe('seattle_fallback');
  });

  it('pairs the fallback with a visible note pointing at search', () => {
    expect(SEATTLE_FALLBACK_NOTE).toContain('Seattle');
    expect(SEATTLE_FALLBACK_NOTE.toLowerCase()).toContain('search');
  });
});
