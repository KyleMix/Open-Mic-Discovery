import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { signOut } from '@/features/auth/api';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { palette, spacing, type } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const [error, setError] = useState<string | null>(null);

  if (profile.isPending) {
    return <LoadingView label="Loading your profile" />;
  }
  if (profile.isError) {
    return (
      <Screen>
        <Title>Profile</Title>
        <ErrorText>Could not load your profile. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => profile.refetch()} />
      </Screen>
    );
  }
  if (!profile.data) {
    return (
      <Screen>
        <Title>Profile</Title>
        <Body>Your profile is not set up yet. Sign out and back in to restart setup.</Body>
        <Button label="Sign out" onPress={() => signOut().catch(() => null)} />
      </Screen>
    );
  }

  const p = profile.data;
  return (
    <Screen>
      <Title>{p.display_name}</Title>
      <Text style={styles.handle}>@{p.handle}</Text>
      <View style={styles.roles}>
        {p.is_performer ? <Text style={styles.roleChip}>Performer</Text> : null}
        {p.is_producer ? <Text style={styles.roleChip}>Producer</Text> : null}
      </View>
      {p.home_city ? <Body>{p.home_city}</Body> : null}
      {p.bio ? <Body>{p.bio}</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Settings" kind="secondary" onPress={() => router.push('/settings')} />
      {p.is_admin ? (
        <Button label="Moderation queue" kind="secondary" onPress={() => router.push('/admin')} />
      ) : null}
      <Button
        label="Sign out"
        kind="secondary"
        onPress={() =>
          signOut().catch((e) =>
            setError(e instanceof Error ? e.message : 'Sign out failed. Try again.'),
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  handle: {
    color: palette.textSecondary,
    fontSize: type.body.fontSize,
  },
  roles: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  roleChip: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 16,
    borderWidth: 1,
    color: palette.text,
    fontSize: type.caption.fontSize,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
