import { geocodeVenueAddress } from './venue-geocode.web';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function respond(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe('web venue geocoding', () => {
  it('reads coordinates out of a Nominatim hit', async () => {
    fetchMock.mockReturnValue(respond([{ lat: '47.0379', lon: '-122.9007' }]));

    await expect(geocodeVenueAddress('7035 Pacific Ave SE, Olympia, WA')).resolves.toEqual({
      lat: 47.0379,
      lng: -122.9007,
    });

    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('nominatim.openstreetmap.org');
    // The address has spaces and commas, so a raw interpolation would break it.
    expect(url).toContain(encodeURIComponent('7035 Pacific Ave SE, Olympia, WA'));
  });

  it('returns null for no match rather than throwing', async () => {
    fetchMock.mockReturnValue(respond([]));
    await expect(geocodeVenueAddress('nowhere at all')).resolves.toBeNull();
  });

  it('returns null on an error response', async () => {
    fetchMock.mockReturnValue(respond([], false));
    await expect(geocodeVenueAddress('anything')).resolves.toBeNull();
  });

  it('returns null when the network fails, so the form stays usable', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(geocodeVenueAddress('anything')).resolves.toBeNull();
  });

  it('rejects implausible coordinates', async () => {
    fetchMock.mockReturnValue(respond([{ lat: '0', lon: '0' }]));
    await expect(geocodeVenueAddress('null island')).resolves.toBeNull();
  });

  it('keeps one request in flight so typing cannot fan out', async () => {
    // Nominatim's usage policy is one request per second, so a burst of
    // keystrokes must not turn into a burst of parallel requests.
    let release: (value: unknown) => void = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    fetchMock.mockReturnValueOnce(
      gate.then(() => ({ ok: true, json: () => [{ lat: '1', lon: '2' }] })),
    );
    fetchMock.mockReturnValue(respond([{ lat: '3', lon: '4' }]));

    const first = geocodeVenueAddress('one');
    const second = geocodeVenueAddress('two');

    // Requests are chained, so the first leaves on a microtask rather than
    // synchronously. Flush the queue, then check the second is still waiting.
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(null);
    await first;
    await second;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
