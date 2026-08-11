import { StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { palette, spacing } from '@/theme';

/**
 * Bottom sheets slide up by default; people who asked the OS to reduce
 * motion get a cross-fade instead, which presents without travel.
 */
export function useSheetAnimation(): 'slide' | 'fade' {
  const reduceMotion = useReducedMotion();
  return reduceMotion ? 'fade' : 'slide';
}

/** The pull-bar artwork shared by the picker sheets. */
export function SheetGrabber() {
  return <View style={styles.grabber} />;
}

const styles = StyleSheet.create({
  grabber: {
    alignSelf: 'center',
    backgroundColor: palette.border,
    borderRadius: 3,
    height: 5,
    marginVertical: spacing.sm,
    width: 44,
  },
});
