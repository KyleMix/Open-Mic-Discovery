import { RADIUS_CHOICES, formatMilesFromMeters, radiusLabel } from './distance';

describe('formatMilesFromMeters', () => {
  it('shows a decimal under ten miles', () => {
    expect(formatMilesFromMeters(1609.344)).toBe('1.0 mi');
    expect(formatMilesFromMeters(644)).toBe('0.4 mi');
  });
  it('rounds at ten miles and above', () => {
    expect(formatMilesFromMeters(19312)).toBe('12 mi');
  });
});

describe('radiusLabel', () => {
  it('labels every offered choice', () => {
    expect(RADIUS_CHOICES.map((c) => radiusLabel(c.km))).toEqual([
      '5 miles',
      '10 miles',
      '25 miles',
      '50 miles',
    ]);
  });
  it('approximates values outside the choices', () => {
    expect(radiusLabel(32)).toBe('20 miles');
  });
});
