import { CACHE_BUSTER, queryClient } from './query-client';

describe('the persisted cache', () => {
  it('carries a version stamp, so an old row shape cannot be restored', () => {
    // Without this, a cached profile written before stage_name existed comes
    // back after the migration and renders with the field missing.
    expect(typeof CACHE_BUSTER).toBe('string');
    expect(CACHE_BUSTER.length).toBeGreaterThan(0);
  });

  it('keeps listings readable long enough to matter offline', () => {
    // Performers open this in venue car parks on one bar. A short gcTime
    // would drop the very rows the persister exists to keep.
    const defaults = queryClient.getDefaultOptions().queries;
    expect(defaults?.gcTime).toBe(24 * 60 * 60 * 1000);
  });
});
