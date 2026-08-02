import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { signOut } from '@/features/auth/api';
import { useOwnProfile } from '@/features/auth/queries';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useSession } from '@/features/auth/session';
import { AvatarCircle } from '@/features/profile/avatar-circle';
import { homeAreaLabel } from '@/features/profile/home-area';
import { buildSocialLinks } from '@/features/profile/social';
import { SocialLinkRow } from '@/components/social-links';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { disciplineAccents, palette, spacing, type } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const [error, setError] = useState<string | null>(null);

  // Browsing is open, so this tab is reachable with no account at all.
  if (!session) {
    return (
      <Screen>
        <Title>Your profile</Title>
        <SignUpPrompt
          title="Perform under your stage name"
          reason="Your stage name is what producers and other performers see on the list, never your email."
          perks={[
            'Sign up for slots and track where you have played',
            'Save mics and get reminded the day of',
            'Link your Instagram, TikTok, or site so people can find you',
          ]}
        />
      </Screen>
    );
  }
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
  const links = buildSocialLinks(p);
  return (
    <Screen>
      <View style={styles.header}>
        <AvatarCircle url={p.avatar_url} name={p.stage_name} size={72} />
        <View style={styles.headerText}>
          <Title>{p.stage_name}</Title>
          <Text style={styles.handle}>@{p.handle}</Text>
        </View>
      </View>
      <View style={styles.roles}>
        {p.is_performer ? (
          <Text
            style={[
              styles.roleChip,
              { borderColor: disciplineAccents.music, color: disciplineAccents.music },
            ]}
          >
            Performer
          </Text>
        ) : null}
        {p.is_producer ? (
          <Text
            style={[
              styles.roleChip,
              { borderColor: disciplineAccents.comedy, color: disciplineAccents.comedy },
            ]}
          >
            Producer
          </Text>
        ) : null}
      </View>
      {p.bio ? <Body>{p.bio}</Body> : null}
      {homeAreaLabel(p) ? (
        <Text style={styles.privateNote}>
          Home area: {homeAreaLabel(p)} (only you can see this)
        </Text>
      ) : null}
      <SocialLinkRow links={links} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Edit profile" onPress={() => router.push('/edit-profile')} />
      <Button label="Settings" kind="secondary" onPress={() => router.push('/settings')} />
      {p.is_admin ? (
        <Button label="Moderation queue" kind="secondary" onPress={() => router.push('/admin')} />
      ) : null}
      {p.is_admin ? (
        <Button label="Testing tools" kind="secondary" onPress={() => router.push('/test-kit')} />
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
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
  privateNote: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
});
