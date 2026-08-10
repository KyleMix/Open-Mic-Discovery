import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { LogoMark } from '@/components/logo';
import type { ShareCardModel } from '@/features/share/card-data';
import { transformedImageUrl } from '@/lib/image-url';
import { fonts, palette } from '@/theme';

/**
 * The flyer the app draws for a mic: a 1:1 (or 9:16 story) canvas meant to
 * be captured by react-native-view-shot and handed to the share sheet.
 *
 * Design decisions that are not obvious from the styles alone:
 * - The no-poster treatment is the primary design, not a fallback. Most
 *   mics have no art, so the flat card has to look deliberate on its own,
 *   and the poster path is the variation.
 * - Every dimension scales off `size` so the same component renders the
 *   in-sheet preview and the full-resolution capture. The capture target
 *   mounts at 540pt, which is at least 1080 physical pixels on any 2x
 *   device, so the exported image is never soft.
 * - Text never wraps past its slot: the model pre-truncates by character
 *   count and the Text nodes cap lines, so a 120-character title cannot
 *   push the wordmark off the canvas.
 * - Only the three bundled Poppins weights appear. An unbundled weight
 *   would silently fall back and wreck the captured layout.
 */

export const CARD_BASE = 360;

type Props = {
  model: ShareCardModel;
  variant: 'square' | 'story';
  size: number;
};

export function ShareCard({ model, variant, size }: Props) {
  const s = size / CARD_BASE;
  const height = variant === 'story' ? (size * 16) / 9 : size;
  const withPoster = !!model.posterUrl;
  const secondary = withPoster ? palette.textSecondaryOnImage : palette.textSecondary;
  // Story safe zones: Instagram overlays its own UI on the top and bottom
  // ~13% of the canvas, so the content column pads well clear of both.
  const vertical = variant === 'story' ? 90 * s : 0;

  return (
    <View style={[styles.card, { width: size, height }]}>
      {withPoster ? (
        <>
          <Image
            source={{
              uri: transformedImageUrl(model.posterUrl!, {
                width: 1080,
                height: variant === 'story' ? 1920 : 1080,
              })!,
            }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessible={false}
          />
          <Svg style={StyleSheet.absoluteFill} width={size} height={height}>
            <Defs>
              <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={palette.bg} stopOpacity={0.5} />
                <Stop offset="0.45" stopColor={palette.bg} stopOpacity={0.72} />
                <Stop offset="1" stopColor={palette.bg} stopOpacity={0.94} />
              </LinearGradient>
            </Defs>
            <Rect width={size} height={height} fill="url(#scrim)" />
          </Svg>
        </>
      ) : null}
      <View style={[styles.column, { padding: 30 * s, paddingVertical: 28 * s + vertical }]}>
        <View style={styles.topRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.eyebrow,
              { fontSize: 13 * s, letterSpacing: 2 * s, maxWidth: size * 0.72 },
            ]}
          >
            {model.eyebrow}
          </Text>
          <View style={[styles.chip, { gap: 6 * s }]}>
            <View
              style={{
                width: 7 * s,
                height: 7 * s,
                borderRadius: 4 * s,
                backgroundColor: model.accent,
              }}
            />
            <Text style={[styles.discipline, { fontSize: 10 * s, letterSpacing: 1.7 * s }]}>
              {model.discipline}
            </Text>
          </View>
        </View>
        <View style={styles.middle}>
          <Text numberOfLines={3} style={[styles.title, { fontSize: 38 * s, lineHeight: 43 * s }]}>
            {model.title}
          </Text>
          <View
            style={{
              width: 48 * s,
              height: 4 * s,
              borderRadius: 2 * s,
              backgroundColor: palette.brand,
              marginVertical: 18 * s,
            }}
          />
          {model.venue ? (
            <Text numberOfLines={1} style={[styles.venue, { fontSize: 20 * s }]}>
              {model.venue}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.meta, { fontSize: 14 * s, marginTop: 7 * s, color: secondary }]}
          >
            {model.meta}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text
            numberOfLines={1}
            style={[styles.place, { fontSize: 13 * s, color: secondary, maxWidth: size * 0.5 }]}
          >
            {model.place ?? ''}
          </Text>
          <View style={[styles.lockup, { gap: 6 * s }]}>
            <LogoMark size={20 * s} />
            <Text style={[styles.wordmark, { fontSize: 10 * s, letterSpacing: 1.5 * s }]}>
              OPEN MIC EXPLORER
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bg,
    overflow: 'hidden',
  },
  column: {
    flex: 1,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: palette.brand,
    fontFamily: fonts.semibold,
  },
  chip: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  discipline: {
    color: palette.textSecondary,
    fontFamily: fonts.medium,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: palette.text,
    fontFamily: fonts.semibold,
  },
  venue: {
    color: palette.text,
    fontFamily: fonts.medium,
  },
  meta: {
    fontFamily: fonts.regular,
  },
  bottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  place: {
    fontFamily: fonts.regular,
  },
  lockup: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  wordmark: {
    color: palette.text,
    fontFamily: fonts.medium,
  },
});
