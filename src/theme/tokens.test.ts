import { disciplineAccents, minTouchTarget, palette } from './tokens';

/** Relative luminance per WCAG 2.x. */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const channel = (i: number): number => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme tokens', () => {
  it('defines an accent for every discipline', () => {
    expect(Object.keys(disciplineAccents).sort()).toEqual(['comedy', 'music', 'other', 'poetry']);
  });

  it('every text color meets WCAG AA contrast (4.5:1) on every surface it can sit on', () => {
    const textColors = [
      palette.text,
      palette.textSecondary,
      palette.textFaint,
      palette.danger,
      palette.success,
      palette.warning,
    ];
    const surfaces = [palette.bg, palette.bgElevated, palette.bgPressed];
    for (const color of textColors) {
      for (const surface of surfaces) {
        expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('discipline accents meet non-text contrast (3:1) on background surfaces', () => {
    for (const accent of Object.values(disciplineAccents)) {
      expect(contrastRatio(accent, palette.bg)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(accent, palette.bgElevated)).toBeGreaterThanOrEqual(3);
    }
  });

  it('minimum touch target meets platform guidelines', () => {
    expect(minTouchTarget).toBeGreaterThanOrEqual(44);
  });
});
