import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, palette } from '@/theme';

const MARK = require('../../assets/brand/mark.png');

/** Native aspect of the mark in assets/brand/mark.svg (329 by 423). */
const MARK_ASPECT = 329 / 423;

const WORDMARK = 'OPEN MIC EXPLORER';

/**
 * The Open Mic Explorer mark: a map pin whose interior is a microphone, with
 * the pin point drawn as a downward arrow. Rendered from the delivered
 * artwork (assets/brand/mark.svg, rasterized at three densities by
 * scripts/brand/generate-assets.py) rather than redrawn, so the app and the
 * store icons carry the same mark.
 */
export function LogoMark({ size = 64, color }: { size?: number; color?: string }) {
  return (
    // Decorative; the Logo lockup carries the accessibility label.
    <Image
      testID="logo-mark"
      source={MARK}
      style={{ height: size, width: size * MARK_ASPECT }}
      contentFit="contain"
      tintColor={color}
      accessible={false}
    />
  );
}

type LogoProps = {
  markSize?: number;
  color?: string;
  showWordmark?: boolean;
};

/**
 * Horizontal lockup: mark plus the wordmark in brand type. The wordmark stays
 * live text rather than a bitmap so it scales cleanly and can be recolored for
 * light surfaces.
 */
export function Logo({ markSize = 56, color, showWordmark = true }: LogoProps) {
  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="Open Mic Explorer">
      <LogoMark size={markSize} color={color} />
      {showWordmark ? (
        <Text
          style={[
            styles.wordmark,
            {
              color: color ?? palette.text,
              fontSize: markSize * 0.33,
              marginLeft: markSize * 0.28,
            },
          ]}
        >
          {WORDMARK}
        </Text>
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
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="Open Mic Explorer">
      <LogoMark size={32} />
      <Text style={styles.headerWordmark}>{WORDMARK}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  wordmark: {
    fontFamily: fonts.regular,
    letterSpacing: 1,
  },
  headerWordmark: {
    color: palette.text,
    fontFamily: fonts.regular,
    fontSize: 15,
    letterSpacing: 0.8,
    marginLeft: 9,
  },
});
