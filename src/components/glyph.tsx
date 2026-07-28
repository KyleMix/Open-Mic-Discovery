import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { palette, type Discipline } from '@/theme';
import type { Database } from '@/types/database.types';

type SignupMethod = Database['public']['Enums']['signup_method'];

/**
 * The custom glyph set (white on transparency, tinted at render time).
 * Sources: assets/glyphs, semantic names. Discipline and signup-method
 * glyphs are the same everywhere they appear: chips, cards, markers,
 * detail screens.
 */
const sources = {
  'discipline-music': require('../../assets/glyphs/discipline-music.png'),
  'discipline-comedy': require('../../assets/glyphs/discipline-comedy.png'),
  'discipline-poetry': require('../../assets/glyphs/discipline-poetry.png'),
  'discipline-other': require('../../assets/glyphs/discipline-other.png'),
  'signup-lottery': require('../../assets/glyphs/signup-lottery.png'),
  'signup-first-come': require('../../assets/glyphs/signup-first-come.png'),
  'signup-reserved-slot': require('../../assets/glyphs/signup-reserved-slot.png'),
  'signup-host-booked': require('../../assets/glyphs/signup-host-booked.png'),
  'freshness-badge': require('../../assets/glyphs/freshness-badge.png'),
  'flag-listing': require('../../assets/glyphs/flag-listing.png'),
} as const;

export type GlyphName = keyof typeof sources;

export const disciplineGlyphs: Record<Discipline, GlyphName> = {
  music: 'discipline-music',
  comedy: 'discipline-comedy',
  poetry: 'discipline-poetry',
  other: 'discipline-other',
};

export const signupMethodGlyphs: Record<SignupMethod, GlyphName> = {
  lottery: 'signup-lottery',
  first_come: 'signup-first-come',
  reserved_slot: 'signup-reserved-slot',
  host_booked: 'signup-host-booked',
};

type GlyphProps = {
  name: GlyphName;
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
};

/** Decorative by default; pair with a text label for accessibility. */
export function Glyph({ name, size = 24, color = palette.text, style }: GlyphProps) {
  return (
    <Image
      source={sources[name]}
      accessibilityElementsHidden
      importantForAccessibility="no"
      tintColor={color}
      style={[{ width: size, height: size }, style]}
    />
  );
}
