import { homeAreaError, homeAreaLabel, homeAreaQuery, normalizeHomeArea } from './home-area';

describe('homeAreaError', () => {
  it('accepts city plus state', () => {
    expect(homeAreaError({ city: 'Seattle', region: 'wa', postalCode: '' })).toBeNull();
  });
  it('accepts a valid ZIP alone', () => {
    expect(homeAreaError({ city: '', region: '', postalCode: '98101' })).toBeNull();
  });
  it('rejects a malformed ZIP', () => {
    expect(homeAreaError({ city: '', region: '', postalCode: '981' })).not.toBeNull();
    expect(homeAreaError({ city: '', region: '', postalCode: 'abcde' })).not.toBeNull();
  });
  it('rejects city without state and empty input', () => {
    expect(homeAreaError({ city: 'Seattle', region: '', postalCode: '' })).not.toBeNull();
    expect(homeAreaError({ city: '', region: '', postalCode: '' })).not.toBeNull();
  });
});

describe('normalizeHomeArea', () => {
  it('trims and uppercases the state', () => {
    expect(normalizeHomeArea({ city: ' Seattle ', region: ' wa ', postalCode: ' ' })).toEqual({
      city: 'Seattle',
      region: 'WA',
      postalCode: '',
    });
  });
});

describe('homeAreaQuery', () => {
  it('prefers city and state for geocoding', () => {
    expect(homeAreaQuery({ city: 'Seattle', region: 'WA', postalCode: '98101' })).toBe(
      'Seattle, WA',
    );
  });
  it('falls back to the ZIP', () => {
    expect(homeAreaQuery({ city: '', region: '', postalCode: '98101' })).toBe('98101');
  });
});

describe('homeAreaLabel', () => {
  it('renders city, state when present', () => {
    expect(
      homeAreaLabel({ home_city: 'Seattle', home_region: 'WA', home_postal_code: null }),
    ).toBe('Seattle, WA');
  });
  it('falls back to the ZIP, then null', () => {
    expect(homeAreaLabel({ home_city: null, home_region: null, home_postal_code: '98101' })).toBe(
      '98101',
    );
    expect(homeAreaLabel({ home_city: null, home_region: null, home_postal_code: null })).toBeNull();
  });
});
