import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useLatestEula, useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { getSupabase } from '@/lib/supabase';
import { useOnboardingStore } from '@/stores/onboarding';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { palette, spacing, type } from '@/theme';

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
        throw new Error(error.message);
      }
      await queryClient.invalidateQueries({ queryKey: ['profile', profile.data.id] });
      router.replace('/(tabs)');
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
        Open Mic Finder has zero tolerance for abusive behavior and objectionable content. Read and
        accept the terms to continue.
      </Body>
      <ScrollView style={styles.terms} accessibilityLabel="Terms of use text">
        <Text style={styles.termsText}>{eula.data.body_md}</Text>
      </ScrollView>
      {acceptError ? <ErrorText>{acceptError}</ErrorText> : null}
      <Button label={`I accept (version ${eula.data.version})`} busy={busy} onPress={accept} />
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
  },
});
