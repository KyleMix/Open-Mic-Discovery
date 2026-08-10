import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { signOut } from '@/features/auth/api';
import { useOwnProfile } from '@/features/auth/queries';
import { useIsAdminReader } from '@/features/safety/queries';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useSession } from '@/features/auth/session';
import { formatRelativeDay } from '@/features/discovery/date-label';
import { AvatarCircle } from '@/features/profile/avatar-circle';
import { homeAreaLabel } from '@/features/profile/home-area';
import { buildSocialLinks } from '@/features/profile/social';
import { SocialLinkRow } from '@/components/social-links';
import { STATUS_LABELS } from '@/features/signups/labels';
import { useMyNights, type MyNight } from '@/features/signups/queries';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { disciplineAccents, fonts, minTouchTarget, palette, spacing, type } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  // Read-only reviewers get the queue link too; the queue itself hides the
  // action buttons from them.
  const reader = useIsAdminReader(session?.user.id);
  const [error, setError] = useState<string | null>(null);

  // Browsing is open, so this tab is reachable with no account at all.
  if (!session) {
    return (
      <Screen>
        <Title>Your profile</Title>
        <SignUpPrompt
          title="Perform under your stage name"
          reason="Your stage name is what hosts and other performers see on the list, never your email."
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
  if (profile.isError && profile.data === undefined) {
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
            Host
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
      {p.is_performer ? (
        <MyNights userId={p.id} onOpenMic={(id) => router.push(`/mic/${id}`)} />
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Edit profile" onPress={() => router.push('/edit-profile')} />
      <Button label="Settings" kind="secondary" onPress={() => router.push('/settings')} />
      {p.is_admin || reader.data ? (
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
    return (
      <View style={styles.nightsWrap}>
        <Text style={styles.sectionTitle}>My nights</Text>
        <Body>
          Nights you sign up for land here: your schedule up top, your history under it. Find a mic
          on the Discover tab to start the list.
        </Body>
      </View>
    );
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
  // Past nights stay absolute dates; a history that says "Tonight" lies.
  const date = past
    ? new Date(night.occurrence.starts_at).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : formatRelativeDay(night.occurrence.starts_at, night.occurrence.series?.timezone);
  const title = night.occurrence.series?.title ?? 'Listing unavailable';
  const label =
    past && (night.status === 'confirmed' || night.status === 'drawn')
      ? 'Was on the list'
      : STATUS_LABELS[night.status];
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
    minWidth: 90,
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
  privateNote: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
});
