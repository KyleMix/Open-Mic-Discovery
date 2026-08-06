import { routeForPushPayload } from './notifications';

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

describe('routeForPushPayload', () => {
  it('routes series payloads straight to the mic page', async () => {
    await expect(routeForPushPayload({ series_id: 'abc' })).resolves.toBe('/mic/abc');
  });

  it('resolves occurrence payloads through their series', async () => {
    getSupabase().maybeSingle.mockResolvedValue({ data: { series_id: 'xyz' } });
    await expect(routeForPushPayload({ occurrence_id: 'occ-1' })).resolves.toBe('/mic/xyz');
  });

  it('returns null for junk payloads and unknown occurrences', async () => {
    getSupabase().maybeSingle.mockResolvedValue({ data: null });
    await expect(routeForPushPayload(null)).resolves.toBeNull();
    await expect(routeForPushPayload('nope')).resolves.toBeNull();
    await expect(routeForPushPayload({})).resolves.toBeNull();
    await expect(routeForPushPayload({ occurrence_id: 'gone' })).resolves.toBeNull();
  });

  it('prefers the series it was handed over a lookup', async () => {
    getSupabase().maybeSingle.mockClear();
    await expect(
      routeForPushPayload({ series_id: 'abc', occurrence_id: 'occ-1' }),
    ).resolves.toBe('/mic/abc');
    expect(getSupabase().maybeSingle).not.toHaveBeenCalled();
  });

  it('ignores ids that are not strings', async () => {
    // Payloads arrive from outside the app. A number here would otherwise
    // build "/mic/123" and land on a page that cannot exist.
    await expect(routeForPushPayload({ series_id: 123 })).resolves.toBeNull();
    await expect(routeForPushPayload({ series_id: null })).resolves.toBeNull();
    await expect(routeForPushPayload({ occurrence_id: 123 })).resolves.toBeNull();
  });

  it('survives an array, which is an object carrying no ids', async () => {
    await expect(routeForPushPayload([])).resolves.toBeNull();
  });
});
