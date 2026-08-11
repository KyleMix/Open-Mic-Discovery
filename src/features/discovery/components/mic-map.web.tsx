import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatMilesFromMeters } from '@/features/discovery/distance';
import type { NearbyMic } from '@/features/discovery/queries';
import { fonts, maxFontScale, palette, radius, spacing, type } from '@/theme';

type Props = {
  mics: NearbyMic[];
  center: { lat: number; lng: number };
  onSelect: (seriesId: string) => void;
};

/**
 * Web fallback: react-native-maps is native-only, so the browser preview
 * shows a distance-ordered list where the map would be. The real map renders
 * on iOS and Android.
 */
export function MicMap({ mics, onSelect }: Props) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.note}>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.noteText}>
          The map lives in the iOS and Android apps. Web preview shows the same mics nearest first.
        </Text>
      </View>
      {mics.map((mic) => (
        <Pressable
          key={mic.series_id}
          accessibilityRole="button"
          accessibilityLabel={`${mic.title} at ${mic.venue_name}`}
          onPress={() => onSelect(mic.series_id)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.bgPressed }]}
        >
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.title}>
            {mic.title}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.meta}>
            {mic.venue_name}, {mic.city}
            {mic.distance_m != null ? ` · ${formatMilesFromMeters(mic.distance_m)}` : ''}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  note: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
  },
  noteText: {
    color: palette.textSecondary,
    fontFamily: fonts.regular,
    fontSize: type.caption.fontSize,
  },
  row: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  title: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  meta: {
    color: palette.textSecondary,
    fontFamily: fonts.regular,
    fontSize: type.caption.fontSize,
  },
});
