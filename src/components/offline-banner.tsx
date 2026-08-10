import * as Network from 'expo-network';
import { StyleSheet, Text } from 'react-native';

import { maxFontScale, palette, spacing, type } from '@/theme';

/**
 * Says when what you are looking at is cached.
 *
 * Listing data is persisted across restarts, which is deliberate: performers
 * check this app in venue car parks on one bar of signal. The cost of that is
 * a screen full of plausible data with no hint it might be hours old. This
 * makes the difference visible without hiding the content behind it.
 */
export function OfflineBanner() {
  const state = Network.useNetworkState();

  // Undefined while the first check runs. Only claim offline once known, so a
  // banner never flashes on a healthy launch.
  const offline = state.isInternetReachable === false || state.isConnected === false;
  if (!offline) {
    return null;
  }

  return (
    <Text maxFontSizeMultiplier={maxFontScale} accessibilityRole="alert" style={styles.banner}>
      Offline. Showing the last mics loaded, which may have changed.
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: palette.bgPressed,
    color: palette.warning,
    fontSize: type.caption.fontSize,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textAlign: 'center',
  },
});
