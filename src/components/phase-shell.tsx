import { StyleSheet, Text, View } from 'react-native';

import { fonts, palette, spacing, type } from '@/theme';

type Props = {
  title: string;
  body: string;
};

/**
 * Temporary screen body used while a tab's feature has not shipped yet.
 * Every use of this component must be listed in REVIEW_NOTES.md, and none
 * may remain by Phase 8.
 */
export function PhaseShell({ title, body }: Props) {
  return (
    <View style={styles.container} accessibilityLabel={`${title} screen`}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.title.fontSize,
    letterSpacing: 0.5,
    lineHeight: type.title.lineHeight,
  },
  body: {
    color: palette.textSecondary,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    textAlign: 'center',
  },
});
