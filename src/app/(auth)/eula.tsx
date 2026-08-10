import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { signOut } from '@/features/auth/api';
import { parseEulaMarkdown } from '@/features/auth/eula-markdown';
import { useLatestEula, useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
import { useOnboardingStore } from '@/stores/onboarding';
import { consumeReturnTo } from '@/stores/return-to';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { maxFontScale, palette, radius, spacing, type } from '@/theme';

export default function EulaScreen() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const queryClient = useQueryClient();
  const eula = useLatestEula();
  const setAccepted = useOnboardingStore((s) => s.setAcceptedEulaVersion);
  const [busy, setBusy] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  if (eula.isPending) {
    return <LoadingView label="Loading terms" />;
  }
  if (eula.isError) {
    return (
      <Screen>
        <Title>Terms of use</Title>
        <ErrorText>Could not load the terms. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => eula.refetch()} />
      </Screen>
    );
  }
  if (!eula.data) {
    return (
      <Screen>
        <Title>Terms of use</Title>
        <ErrorText>Terms are unavailable right now. Try again shortly.</ErrorText>
        <Button label="Try again" onPress={() => eula.refetch()} />
      </Screen>
    );
  }

  const accept = async () => {
    const version = eula.data!.version;
    // New users accept before their profile exists; the version is carried
    // into the profile insert at onboarding. Existing users re-accepting an
    // updated EULA record it on their profile immediately.
    if (!profile.data) {
      setAccepted(version);
      router.replace('/(auth)/onboarding');
      return;
    }
    setBusy(true);
    setAcceptError(null);
    try {
      const { error } = await getSupabase()
        .from('profiles')
        .update({ eula_version: version })
        .eq('id', profile.data.id);
      if (error) {
        throw userError(error, 'Could not record acceptance. Check your connection and try again.');
      }
      await queryClient.invalidateQueries({ queryKey: ['profile', profile.data.id] });
      // A deep link that got interrupted by a re-accept lands where it was
      // headed, not on the default tab.
      const returnTo = consumeReturnTo();
      router.replace((returnTo ?? '/(tabs)') as Parameters<typeof router.replace>[0]);
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : 'Could not record acceptance.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Before you continue</Title>
      <Body>
        Open Mic Explorer has zero tolerance for abusive behavior and objectionable content. Read
        and accept the terms to continue.
      </Body>
      <ScrollView style={styles.terms} accessibilityLabel="Terms of use text">
        {parseEulaMarkdown(eula.data.body_md).map((block, i) =>
          block.kind === 'title' ? (
            <Text maxFontSizeMultiplier={maxFontScale} key={i} style={styles.termsTitle}>
              {block.text}
            </Text>
          ) : block.kind === 'heading' ? (
            <Text maxFontSizeMultiplier={maxFontScale} key={i} style={styles.termsHeading}>
              {block.text}
            </Text>
          ) : block.kind === 'bullet' ? (
            <Text maxFontSizeMultiplier={maxFontScale} key={i} style={styles.termsText}>
              {'•'} {block.text}
            </Text>
          ) : (
            <Text maxFontSizeMultiplier={maxFontScale} key={i} style={styles.termsText}>
              {block.text}
            </Text>
          ),
        )}
      </ScrollView>
      {acceptError ? <ErrorText>{acceptError}</ErrorText> : null}
      <Button
        label="Read the privacy policy"
        kind="secondary"
        onPress={() => router.push('/privacy')}
      />
      <Button label="I accept the terms" busy={busy} onPress={accept} />
      <Button
        label="Not now: sign out"
        kind="secondary"
        onPress={() => {
          // The gate holds this screen until the terms are accepted, so
          // declining needs a real way out rather than a trap. A failed
          // sign-out on the escape hatch cannot be silent.
          signOut().catch(() => setAcceptError('Could not sign out. Check your connection.'));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  terms: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
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
    fontSize: type.body.fontSize,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  termsHeading: {
    color: palette.text,
    fontSize: type.caption.fontSize,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
});
