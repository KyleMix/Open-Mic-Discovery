import { canManageSeries } from './ownership';

describe('canManageSeries', () => {
  const owned = { owner_id: 'host-1', created_by: 'host-1' };
  const claimed = { owner_id: 'host-2', created_by: 'host-1' };
  const unclaimed = { owner_id: null, created_by: 'host-1' };

  it('lets the owner manage', () => {
    expect(canManageSeries(owned, 'host-1')).toBe(true);
  });

  it('refuses everyone else, including the creator once someone claimed it', () => {
    expect(canManageSeries(owned, 'performer-9')).toBe(false);
    expect(canManageSeries(claimed, 'host-1')).toBe(false);
  });

  it('lets the creator manage while the listing is unclaimed', () => {
    expect(canManageSeries(unclaimed, 'host-1')).toBe(true);
    expect(canManageSeries(unclaimed, 'performer-9')).toBe(false);
  });

  it('refuses guests', () => {
    expect(canManageSeries(owned, null)).toBe(false);
    expect(canManageSeries(owned, undefined)).toBe(false);
  });

  it('lets an admin manage anything', () => {
    expect(canManageSeries(owned, 'admin-1', true)).toBe(true);
  });
});
