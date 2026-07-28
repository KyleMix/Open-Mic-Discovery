import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { disciplineAccents, fonts, palette } from '@/theme';

/**
 * The Open Mic Finder mark: a line-drawn microphone whose body is a map-pin
 * teardrop, with three radiating arcs in the discipline accents. Vector
 * recreation of the official logo so it renders crisply at any size and in
 * both dark and light contexts.
 */
export function LogoMark({ size = 64, color = palette.text }: { size?: number; color?: string }) {
  const stroke = size / 16;
  return (
    // Decorative; the Logo lockup carries the accessibility label. No
    // accessibility props on Svg itself: react-native-svg's web renderer
    // passes unknown props straight to the DOM.
    <Svg width={size * 1.5} height={size} viewBox="0 0 96 64" fill="none">
      {/* Teardrop mic body */}
      <Path
        d="M30 6 C41 6 47 15 47 25 C47 35 40 43 30 50 C20 43 13 35 13 25 C13 15 19 6 30 6 Z"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Grille lines */}
      <Line
        x1="17"
        y1="18"
        x2="43"
        y2="18"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <Line
        x1="15"
        y1="25"
        x2="45"
        y2="25"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <Line
        x1="17"
        y1="32"
        x2="43"
        y2="32"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Stand */}
      <Line
        x1="30"
        y1="50"
        x2="30"
        y2="57"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <Line
        x1="21"
        y1="58"
        x2="39"
        y2="58"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Radiating arcs: music, comedy, poetry */}
      <Path
        d="M56 25 C58 28 58 34 56 37"
        stroke={disciplineAccents.music}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <Path
        d="M64 19 C68 24 68 38 64 43"
        stroke={disciplineAccents.comedy}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <Path
        d="M73 13 C79 20 79 42 73 49"
        stroke={disciplineAccents.poetry}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </Svg>
  );
}

type LogoProps = {
  markSize?: number;
  color?: string;
  showWordmark?: boolean;
};

/** Horizontal lockup: mark plus the wordmark in brand type. */
export function Logo({ markSize = 56, color = palette.text, showWordmark = true }: LogoProps) {
  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="Open Mic Finder">
      <LogoMark size={markSize} color={color} />
      {showWordmark ? (
        <Text style={[styles.wordmark, { color, fontSize: markSize * 0.34 }]}>Open Mic Finder</Text>
      ) : null}
    </View>
  );
}

/**
 * Compact lockup sized for a navigation bar: the mark plus the name at a
 * legible size. Used as the Discover header so the brand fronts the
 * screen people see most.
 */
export function BrandHeader() {
  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="Open Mic Finder">
      <LogoMark size={30} />
      <Text style={styles.headerWordmark}>Open Mic Finder</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  wordmark: {
    fontFamily: fonts.medium,
    letterSpacing: 4,
  },
  headerWordmark: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: 17,
    letterSpacing: 1.5,
  },
});
