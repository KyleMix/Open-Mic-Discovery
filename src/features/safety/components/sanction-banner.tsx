import { StyleSheet, Text } from 'react-native';

import { useSession } from '@/features/auth/session';
import { sanctionMessage } from '@/features/safety/labels';
import { useMySanction } from '@/features/safety/queries';
import { fonts, maxFontScale, palette, spacing, type } from '@/theme';

/**
 * A live sanction, said once at the top of the app instead of leaking out
 * as unrelated failures ("Signups are not open", "Could not submit"). The
 * reason column exists to be read by its subject; this is where they read
 * it.
 */
export function SanctionBanner() {
  const { session } = useSession();
  const sanction = useMySanction(session?.user.id);
  if (!sanction.data) {
    return null;
  }
  return (
    <Text maxFontSizeMultiplier={maxFontScale} accessibilityRole="alert" style={styles.banner}>
      {sanctionMessage(sanction.data)}
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: palette.bgPressed,
    color: palette.danger,
    fontFamily: fonts.regular,
    fontSize: type.caption.fontSize,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textAlign: 'center',
  },
});
