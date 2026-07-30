import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button } from '@/components/ui';
import { fonts, palette, spacing, type } from '@/theme';

/**
 * The pitch for making an account, shown where the benefit actually is.
 *
 * Browsing is open, so this never blocks a door. It appears at the moment
 * someone reaches for something an account provides: getting on a list, saving
 * a mic, being reminded. Every reason listed here is a feature that already
 * exists, and everything is free, so the ask is only for an email.
 */
export function SignUpPrompt({
  title,
  reason,
  perks,
}: {
  title: string;
  /** The one-line answer to "why do you need my email". */
  reason: string;
  /** What else the account gets them, kept short and concrete. */
  perks?: string[];
}) {
  const router = useRouter();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Body>{reason}</Body>
      {perks && perks.length > 0 ? (
        <View style={styles.perks}>
          {perks.map((perk) => (
            <Text key={perk} style={styles.perk}>
              {'·'} {perk}
            </Text>
          ))}
        </View>
      ) : null}
      <Button label="Create a free account" onPress={() => router.push('/(auth)/sign-up')} />
      <Button
        label="I already have one"
        kind="secondary"
        onPress={() => router.push('/(auth)/sign-in')}
      />
      <Text style={styles.footnote}>
        Free, and always will be. An email and your city is all it takes.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  title: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  perks: {
    gap: spacing.xs,
  },
  perk: {
    color: palette.textSecondary,
    fontSize: type.body.fontSize,
  },
  footnote: {
    color: palette.textDisabled,
    fontSize: type.caption.fontSize,
  },
});
