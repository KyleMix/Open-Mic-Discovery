import { pathFromNotificationData } from './notifications';

jest.mock('@/lib/supabase', () => {
  const maybeSingle = jest.fn();
  const chain = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle,
  };
  return { getSupabase: () => chain };
});

const { getSupabase } = jest.requireMock('@/lib/supabase') as {
  getSupabase: () => { maybeSingle: jest.Mock };
};

describe('pathFromNotificationData', () => {
  it('routes series payloads straight to the mic page', async () => {
    await expect(pathFromNotificationData({ series_id: 'abc' })).resolves.toBe('/mic/abc');
  });

  it('resolves occurrence payloads through their series', async () => {
    getSupabase().maybeSingle.mockResolvedValue({ data: { series_id: 'xyz' } });
    await expect(pathFromNotificationData({ occurrence_id: 'occ-1' })).resolves.toBe('/mic/xyz');
  });

  it('returns null for junk payloads and unknown occurrences', async () => {
    getSupabase().maybeSingle.mockResolvedValue({ data: null });
    await expect(pathFromNotificationData(null)).resolves.toBeNull();
    await expect(pathFromNotificationData('nope')).resolves.toBeNull();
    await expect(pathFromNotificationData({})).resolves.toBeNull();
    await expect(pathFromNotificationData({ occurrence_id: 'gone' })).resolves.toBeNull();
  });
});
