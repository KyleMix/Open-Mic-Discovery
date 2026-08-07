import { StyleSheet, View } from 'react-native';

import { palette, spacing } from '@/theme';

/**
 * Placeholder rows shown while the first feed loads, shaped like MicCard
 * so results appearing does not reflow the list. Static rather than
 * shimmering: a pulse animation on the core screen buys nothing but
 * battery.
 */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading mics">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.accent} />
          <View style={styles.body}>
            <View style={[styles.line, styles.title]} />
            <View style={[styles.line, styles.venue]} />
            <View style={[styles.line, styles.meta]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  accent: {
    backgroundColor: palette.bgPressed,
    width: 4,
  },
  body: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  line: {
    backgroundColor: palette.bgPressed,
    borderRadius: 4,
    height: 12,
  },
  title: {
    width: '55%',
  },
  venue: {
    width: '75%',
  },
  meta: {
    width: '40%',
  },
});
