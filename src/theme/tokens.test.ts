import { disciplineAccents, minTouchTarget, palette } from './tokens';

/** Relative luminance per WCAG 2.x. */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme tokens', () => {
  it('defines an accent for every discipline', () => {
    expect(Object.keys(disciplineAccents).sort()).toEqual(['comedy', 'music', 'other', 'poetry']);
  });

  it('body text meets WCAG AA contrast (4.5:1) on the background', () => {
    expect(contrastRatio(palette.text, palette.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.textSecondary, palette.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('discipline accents meet non-text contrast (3:1) on the background', () => {
    for (const accent of Object.values(disciplineAccents)) {
      expect(contrastRatio(accent, palette.bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('minimum touch target meets platform guidelines', () => {
    expect(minTouchTarget).toBeGreaterThanOrEqual(44);
  });
});
