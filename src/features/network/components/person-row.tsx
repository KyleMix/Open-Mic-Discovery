import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AvatarCircle } from '@/features/profile/avatar-circle';
import { fonts, maxFontScale, palette, radius, spacing, type } from '@/theme';

type Props = {
  name: string;
  handle: string;
  subtitle: string;
  avatarUrl: string | null;
  /** Action buttons on the right; the row itself is not pressable. */
  actions?: ReactNode;
  /** Rendered full-width under the identity line: socials, nights, errors. */
  children?: ReactNode;
};

/** One person in the network lists: who they are, then what you can do. */
export function PersonRow({ name, handle, subtitle, avatarUrl, actions, children }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.identity}>
        <AvatarCircle url={avatarUrl} name={name} size={44} />
        <View style={styles.names}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.name}>
            {name}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.meta}>
            @{handle} · {subtitle}
          </Text>
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  identity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  names: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.body.fontSize,
  },
  meta: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
});
