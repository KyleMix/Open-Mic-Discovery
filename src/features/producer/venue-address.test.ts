import { isPlausibleCoords, venueAddressQuery } from './venue-address';

describe('venueAddressQuery', () => {
  it('joins street, city, and state into one lookup string', () => {
    expect(
      venueAddressQuery({ street: '7035 Pacific Ave SE', city: 'Olympia', region: 'WA' }),
    ).toBe('7035 Pacific Ave SE, Olympia, WA');
  });

  it('trims whitespace producers leave behind', () => {
    expect(
      venueAddressQuery({ street: '  7035 Pacific Ave SE ', city: ' Olympia', region: 'WA ' }),
    ).toBe('7035 Pacific Ave SE, Olympia, WA');
  });

  it('returns null until every part is present', () => {
    // A street with no city geocodes to whichever city the device guesses,
    // which would drop the pin somewhere confidently wrong.
    expect(venueAddressQuery({ street: '7035 Pacific Ave SE', city: '', region: 'WA' })).toBeNull();
    expect(venueAddressQuery({ street: '', city: 'Olympia', region: 'WA' })).toBeNull();
    expect(
      venueAddressQuery({ street: '7035 Pacific Ave SE', city: 'Olympia', region: '' }),
    ).toBeNull();
    expect(venueAddressQuery({ street: '   ', city: '   ', region: '   ' })).toBeNull();
  });
});

describe('isPlausibleCoords', () => {
  it('accepts real venue coordinates', () => {
    expect(isPlausibleCoords({ lat: 47.0379, lng: -122.9007 })).toBe(true);
    expect(isPlausibleCoords({ lat: -33.8688, lng: 151.2093 })).toBe(true);
  });

  it('rejects out-of-range values', () => {
    expect(isPlausibleCoords({ lat: 91, lng: 0 })).toBe(false);
    expect(isPlausibleCoords({ lat: 0, lng: 181 })).toBe(false);
    expect(isPlausibleCoords({ lat: Number.NaN, lng: 12 })).toBe(false);
  });

  it('rejects Null Island, which a failed lookup returns instead of an error', () => {
    expect(isPlausibleCoords({ lat: 0, lng: 0 })).toBe(false);
  });
});
