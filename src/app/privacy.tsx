import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Screen, Title } from '@/components/ui';
import { parseEulaMarkdown } from '@/features/auth/eula-markdown';
import { PRIVACY_POLICY_MD } from '@/features/legal/privacy-policy';
import { fonts, maxFontScale, palette, radius, spacing, type } from '@/theme';

/**
 * The privacy policy, reachable by guests, by accounts still at the EULA
 * gate, and from Settings (the auth gate allows this route in every
 * state). The content ships with the binary, so there are no loading,
 * empty, or error states: it always renders.
 */
export default function PrivacyScreen() {
  return (
    <Screen>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Privacy policy',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />
      <Title>Privacy policy</Title>
      <ScrollView style={styles.policy} accessibilityLabel="Privacy policy text">
        {parseEulaMarkdown(PRIVACY_POLICY_MD).map((block, i) =>
          block.kind === 'title' ? (
            <Text maxFontSizeMultiplier={maxFontScale} key={i} style={styles.policyTitle}>
              {block.text}
            </Text>
          ) : block.kind === 'heading' ? (
            <Text maxFontSizeMultiplier={maxFontScale} key={i} style={styles.policyHeading}>
              {block.text}
            </Text>
          ) : block.kind === 'bullet' ? (
            <Text maxFontSizeMultiplier={maxFontScale} key={i} style={styles.policyText}>
              {'•'} {block.text}
            </Text>
          ) : (
            <Text maxFontSizeMultiplier={maxFontScale} key={i} style={styles.policyText}>
              {block.text}
            </Text>
          ),
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  policy: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    padding: spacing.md,
  },
  policyText: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight + 4,
    marginBottom: spacing.sm,
  },
  policyTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.body.fontSize,
    marginBottom: spacing.sm,
  },
  policyHeading: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.caption.fontSize,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
});
