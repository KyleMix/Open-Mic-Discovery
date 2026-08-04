import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { parseEulaMarkdown } from '@/features/auth/eula-markdown';
import { useLatestEula } from '@/features/auth/queries';
import { fonts, palette, spacing, type } from '@/theme';

/**
 * Read-only terms, reachable from Settings. Before this screen the EULA
 * was visible exactly once, at the acceptance gate, and never again.
 */
export default function TermsScreen() {
  const eula = useLatestEula();

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Terms of use',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />
      <Title>Terms of use</Title>
      {eula.isPending ? (
        <LoadingView label="Loading terms" />
      ) : eula.isError || !eula.data ? (
        <>
          <ErrorText>Could not load the terms. Check your connection.</ErrorText>
          <Button label="Try again" onPress={() => eula.refetch()} />
        </>
      ) : (
        <>
          <Body>The terms everyone accepted, version {eula.data.version}.</Body>
          <ScrollView style={styles.terms} accessibilityLabel="Terms of use text">
            {parseEulaMarkdown(eula.data.body_md).map((block, i) =>
              block.kind === 'title' ? (
                <Text key={i} style={styles.termsTitle}>
                  {block.text}
                </Text>
              ) : block.kind === 'heading' ? (
                <Text key={i} style={styles.termsHeading}>
                  {block.text}
                </Text>
              ) : block.kind === 'bullet' ? (
                <Text key={i} style={styles.termsText}>
                  {'•'} {block.text}
                </Text>
              ) : (
                <Text key={i} style={styles.termsText}>
                  {block.text}
                </Text>
              ),
            )}
          </ScrollView>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  terms: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: spacing.md,
  },
  termsText: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight + 4,
    marginBottom: spacing.sm,
  },
  termsTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.body.fontSize,
    marginBottom: spacing.sm,
  },
  termsHeading: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.caption.fontSize,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
});
