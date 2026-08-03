import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { signOut } from '@/features/auth/api';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { AvatarCircle } from '@/features/profile/avatar-circle';
import { homeAreaLabel } from '@/features/profile/home-area';
import { buildSocialLinks } from '@/features/profile/social';
import { STATUS_LABELS } from '@/features/signups/components/signup-card';
import { useMyNights, type MyNight } from '@/features/signups/queries';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { disciplineAccents, fonts, minTouchTarget, palette, spacing, type } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <Screen>
        <Title>Profile</Title>
        <Body>
          Sign in to set up your profile, save favorites, and sign up for slots.
        </Body>
        <Button label="Sign in" onPress={() => router.push('/(auth)/sign-in')} />
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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <AvatarCircle url={p.avatar_url} name={p.display_name} size={72} />
        <View style={styles.headerText}>
          <Title>{p.display_name}</Title>
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
      {links.length > 0 ? (
        <View style={styles.linkRow}>
          {links.map((link) => (
            <Pressable
              key={link.key}
              accessibilityRole="link"
              accessibilityLabel={`Open ${link.label}`}
              onPress={() => Linking.openURL(link.url).catch(() => null)}
              style={({ pressed }) => [styles.linkChip, pressed && styles.linkChipPressed]}
            >
              <Text style={styles.linkChipLabel}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {p.is_performer ? <MyNights userId={p.id} onOpenMic={(id) => router.push(`/mic/${id}`)} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Edit profile" onPress={() => router.push('/edit-profile')} />
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
    </ScrollView>
  );
}

/**
 * The performer's schedule and history, built from their own signups.
 * Upcoming nights first, then how much they have played.
 */
function MyNights({ userId, onOpenMic }: { userId: string; onOpenMic: (id: string) => void }) {
  const nights = useMyNights(userId);
  if (nights.isPending) {
    return <Body>Loading your nights...</Body>;
  }
  if (nights.isError) {
    return <ErrorText>Could not load your nights.</ErrorText>;
  }
  const now = new Date().getTime();
  const withDates = nights.data.filter(
    (n): n is MyNight & { occurrence: NonNullable<MyNight['occurrence']> } => n.occurrence != null,
  );
  const upcoming = withDates
    .filter(
      (n) =>
        new Date(n.occurrence.starts_at).getTime() >= now &&
        n.occurrence.status !== 'cancelled' &&
        !['no_show'].includes(n.status),
    )
    .sort(
      (a, b) =>
        new Date(a.occurrence.starts_at).getTime() - new Date(b.occurrence.starts_at).getTime(),
    );
  const past = withDates
    .filter((n) => new Date(n.occurrence.starts_at).getTime() < now)
    .sort(
      (a, b) =>
        new Date(b.occurrence.starts_at).getTime() - new Date(a.occurrence.starts_at).getTime(),
    );
  if (upcoming.length === 0 && past.length === 0) {
    return null;
  }
  const played = past.filter((n) => ['performed', 'confirmed', 'drawn'].includes(n.status));

  return (
    <View style={styles.nightsWrap}>
      <Text style={styles.sectionTitle}>My nights</Text>
      {upcoming.length > 0 ? (
        <>
          {upcoming.slice(0, 5).map((n) => (
            <NightRow key={n.id} night={n} onOpenMic={onOpenMic} />
          ))}
        </>
      ) : (
        <Body>Nothing coming up. Find a mic on the Discover tab and get on a list.</Body>
      )}
      {past.length > 0 ? (
        <>
          <Text style={styles.playedCount}>
            {played.length === 1 ? '1 night played' : `${played.length} nights played`}
          </Text>
          {past.slice(0, 10).map((n) => (
            <NightRow key={n.id} night={n} onOpenMic={onOpenMic} past />
          ))}
        </>
      ) : null}
    </View>
  );
}

function NightRow({
  night,
  onOpenMic,
  past,
}: {
  night: MyNight & { occurrence: NonNullable<MyNight['occurrence']> };
  onOpenMic: (id: string) => void;
  past?: boolean;
}) {
  const date = new Date(night.occurrence.starts_at).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const title = night.occurrence.series?.title ?? 'Listing unavailable';
  const label = past && night.status === 'confirmed' ? 'Was on the list' : STATUS_LABELS[night.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} on ${date}, ${label}`}
      disabled={!night.occurrence.series}
      onPress={() => night.occurrence.series && onOpenMic(night.occurrence.series.id)}
      style={({ pressed }) => [styles.nightRow, pressed && { backgroundColor: palette.bgPressed }]}
    >
      <Text style={styles.nightDate}>{date}</Text>
      <View style={styles.nightBody}>
        <Text numberOfLines={1} style={styles.nightTitle}>
          {title}
        </Text>
        <Text style={styles.nightStatus}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  scrollContent: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  nightsWrap: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    marginTop: spacing.sm,
  },
  playedCount: {
    color: palette.textSecondary,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
    marginTop: spacing.sm,
  },
  nightRow: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: minTouchTarget,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  nightDate: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    width: 90,
  },
  nightBody: {
    flex: 1,
    gap: 2,
  },
  nightTitle: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  nightStatus: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
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
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  linkChip: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: minTouchTarget - 8,
    paddingHorizontal: spacing.md,
  },
  linkChipPressed: {
    backgroundColor: palette.bgPressed,
  },
  linkChipLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
  },
  privateNote: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
});
