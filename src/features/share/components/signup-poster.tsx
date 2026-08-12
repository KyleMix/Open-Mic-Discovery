import { StyleSheet, Text, View } from 'react-native';

import { LogoMark } from '@/components/logo';
import { QrCode } from '@/components/qr-code';
import type { ShareCardModel } from '@/features/share/card-data';
import { fonts, palette } from '@/theme';

/**
 * The host's signup poster: the QR is the headline, everything else
 * captions it. Where the flyer advertises a night, this replaces the
 * paper signup sheet taped to the bar: it hangs at the venue (or sits in
 * a story) and one scan lands a performer on this mic's page, in the app
 * when they have it, at the page offering the App Store and Google Play
 * when they do not. That is the producer's word-of-mouth loop: the
 * audience at the mic is exactly the crowd the app wants next.
 *
 * Portrait 3:4 (1080x1440 captured), which prints on letter paper without
 * looking like a cropped social asset. Deliberately no photo poster
 * background: this needs to scan under bar lighting from a metre away, so
 * the QR sits on the flat dark canvas with nothing competing.
 *
 * Same fixed-canvas rules as ShareCard: everything scales off `size`,
 * text pins maxFontSizeMultiplier to 1, the model pre-truncates.
 */

export const POSTER_BASE = 360;

type Props = {
  model: ShareCardModel;
  size: number;
};

export function SignupPoster({ model, size }: Props) {
  const s = size / POSTER_BASE;
  const height = (size * 4) / 3;

  return (
    <View style={[styles.card, { width: size, height }]}>
      <View style={[styles.column, { padding: 32 * s, paddingVertical: 30 * s }]}>
        <View style={[styles.top, { gap: 8 * s }]}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1}
            style={[styles.eyebrow, { fontSize: 13 * s, letterSpacing: 2 * s }]}
          >
            {model.eyebrow}
          </Text>
          <Text
            numberOfLines={3}
            maxFontSizeMultiplier={1}
            style={[styles.title, { fontSize: 34 * s, lineHeight: 39 * s }]}
          >
            {model.title}
          </Text>
          {model.venue ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1}
              style={[styles.venue, { fontSize: 18 * s }]}
            >
              {model.venue}
              {model.place ? `, ${model.place}` : ''}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1}
            style={[styles.meta, { fontSize: 14 * s }]}
          >
            {model.meta}
          </Text>
        </View>

        <View style={[styles.scanBlock, { gap: 16 * s }]}>
          <QrCode value={model.shareUrl} size={190 * s} />
          <Text maxFontSizeMultiplier={1} style={[styles.scanLine, { fontSize: 20 * s }]}>
            Scan to sign up
          </Text>
          <Text
            maxFontSizeMultiplier={1}
            style={[styles.scanSub, { fontSize: 12 * s, lineHeight: 17 * s }]}
          >
            See the next night, how the list works, and get on it from your phone.
          </Text>
        </View>

        <View style={[styles.footer, { gap: 6 * s }]}>
          <View style={[styles.lockup, { gap: 5 * s }]}>
            <LogoMark size={22 * s} />
            <Text
              maxFontSizeMultiplier={1}
              style={[styles.wordmark, { fontSize: 11 * s, letterSpacing: 1.6 * s }]}
            >
              OPEN MIC EXPLORER
            </Text>
          </View>
          <Text maxFontSizeMultiplier={1} style={[styles.stores, { fontSize: 11 * s }]}>
            Free on iPhone and Android
          </Text>
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
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'center',
  },
  eyebrow: {
    color: palette.brand,
    fontFamily: fonts.semibold,
    textAlign: 'center',
  },
  title: {
    color: palette.text,
    fontFamily: fonts.semibold,
    textAlign: 'center',
  },
  venue: {
    color: palette.text,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  meta: {
    color: palette.textSecondary,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  scanBlock: {
    alignItems: 'center',
  },
  scanLine: {
    color: palette.text,
    fontFamily: fonts.semibold,
  },
  scanSub: {
    color: palette.textSecondary,
    fontFamily: fonts.regular,
    maxWidth: '80%',
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
  },
  lockup: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  wordmark: {
    color: palette.text,
    fontFamily: fonts.medium,
  },
  stores: {
    color: palette.textSecondary,
    fontFamily: fonts.regular,
  },
});
