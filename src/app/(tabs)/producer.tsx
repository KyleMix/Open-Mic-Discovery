import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Glyph } from '@/components/glyph';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useSession } from '@/features/auth/session';
import { formatRelativeDay } from '@/features/discovery/date-label';
import { freshness } from '@/features/discovery/freshness';
import { describeRecurrence } from '@/features/discovery/recurrence';
import {
  useConfirmSeries,
  useEnableProducerRole,
  useMySeries,
  useNextNights,
  usePendingClaims,
  useReviewClaim,
} from '@/features/producer/queries';
import { fonts, palette, spacing, type } from '@/theme';

export default function ProducerScreen() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const mySeries = useMySeries(session?.user.id);
  const confirm = useConfirmSeries();
  const enableRole = useEnableProducerRole();
  const claims = usePendingClaims(profile.data?.is_admin ?? false);
  const review = useReviewClaim();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const nextNights = useNextNights((mySeries.data ?? []).map((s) => s.id));

  if (!session) {
    return (
      <Screen>
        <Title>My Mics</Title>
        <SignUpPrompt
          title="Run a mic?"
          reason="Listing a mic puts you on the hook for keeping it accurate, so it needs an account."
          perks={[
            'List a night in about two minutes',
            'One tap to confirm it is still running',
            'Run the signup list from the side of the stage',
          ]}
        />
      </Screen>
    );
  }
  if (profile.isPending || mySeries.isPending) {
    return <LoadingView label="Loading your mics" />;
  }
  if ((profile.isError && profile.data === undefined) || (mySeries.isError && mySeries.data === undefined)) {
    return (
      <Screen>
        <Title>My Mics</Title>
        <ErrorText>Could not load your mics. Check your connection.</ErrorText>
        <Button
          label="Try again"
          onPress={() => {
            profile.refetch();
            mySeries.refetch();
          }}
        />
      </Screen>
    );
  }
  const claimsBox =
    profile.data?.is_admin && claims.data && claims.data.length > 0 ? (
      <View style={styles.claimsBox}>
        <Text style={styles.sectionTitle}>Pending claims</Text>
        {claims.data.map((claim) => (
          <View key={claim.id} style={styles.claimRow}>
            <Text style={styles.claimText}>
              {claim.series?.title ?? 'Unknown mic'}: {claim.evidence ?? 'no evidence given'}
            </Text>
            <View style={styles.claimActions}>
              <Button
                label="Approve"
                busy={review.isPending}
                onPress={() => review.mutate({ claimId: claim.id, approve: true })}
              />
              <Button
                label="Reject"
                kind="secondary"
                busy={review.isPending}
                onPress={() => review.mutate({ claimId: claim.id, approve: false })}
              />
            </View>
          </View>
        ))}
      </View>
    ) : null;

  if (profile.data && !profile.data.is_producer) {
    return (
      <Screen>
        {claimsBox}
        <Title>Run a mic?</Title>
        <Body>
          Producers keep listings accurate, manage signup lists, and post lineups. Enabling the
          producer role adds it alongside your performer role; most people in a scene do both.
        </Body>
        {enableRole.isError ? (
          <ErrorText>
            {enableRole.error instanceof Error ? enableRole.error.message : 'Could not enable.'}
          </ErrorText>
        ) : null}
        <Button
          label="Become a producer"
          busy={enableRole.isPending}
          onPress={() => enableRole.mutate(session.user.id)}
        />
      </Screen>
    );
  }

  const series = mySeries.data ?? [];

  return (
    <View style={styles.container}>
      <FlatList
        data={series}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={mySeries.isFetching}
            onRefresh={mySeries.refetch}
            tintColor={palette.textSecondary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Button label="Add a mic" onPress={() => router.push('/producer/new')} />
            {confirm.isError ? (
              <ErrorText>
                Could not confirm the listing. Check your connection and try again.
              </ErrorText>
            ) : null}
            {claimsBox}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.sectionTitle}>No mics yet</Text>
            <Body>
              Create the listing for your mic here, or find it on the Discover tab and claim it if
              someone already listed it.
            </Body>
          </View>
        }
        renderItem={({ item }) => {
          const fresh = freshness(item.last_confirmed_at, new Date());
          const confirming = confirm.isPending && confirmingId === item.id;
          const night = nextNights.data?.[item.id];
          const nightLabel = night ? formatRelativeDay(night.startsAt, item.timezone) : null;
          const nightIsToday = nightLabel === 'Tonight' || nightLabel === 'Today';
          return (
            <View style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Manage ${item.title}`}
                onPress={() => router.push(`/producer/${item.id}`)}
                style={({ pressed }) => [
                  styles.cardTouch,
                  pressed && { backgroundColor: palette.bgPressed },
                ]}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.is_active ? <Text style={styles.pausedTag}>Paused</Text> : null}
                  {item.moderation_status === 'pending' ? (
                    <Text style={styles.pausedTag}>In review</Text>
                  ) : null}
                </View>
                <Text style={styles.cardMeta}>
                  {item.venue?.name}, {item.venue?.city} ·{' '}
                  {describeRecurrence(item.rrule, item.start_time) ?? 'Schedule varies'}
                </Text>
                {night ? (
                  <Text style={styles.nextNight}>
                    {nightIsToday ? nightLabel : `Next: ${nightLabel}`} · {night.signupCount} signed
                    up
                  </Text>
                ) : null}
              </Pressable>
              {night && nightIsToday ? (
                <Button
                  label="Open tonight's list"
                  onPress={() => router.push(`/producer/night/${night.occurrenceId}`)}
                />
              ) : null}
              <View style={styles.cardBottom}>
                <View style={styles.freshRow}>
                  <Glyph name="freshness-badge" size={14} color={fresh.color} />
                  <Text style={[styles.cardMeta, { color: fresh.color }]}>{fresh.label}</Text>
                </View>
                <Button
                  label="Confirm accurate"
                  kind="secondary"
                  busy={confirming}
                  onPress={() => {
                    setConfirmingId(item.id);
                    confirm.mutate(item.id);
                  }}
                />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  list: {
    gap: spacing.md,
    padding: spacing.md,
  },
  header: {
    gap: spacing.md,
  },
  empty: {
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  claimsBox: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.warning,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  claimRow: {
    gap: spacing.sm,
  },
  claimText: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  claimActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    paddingBottom: spacing.md,
  },
  cardTouch: {
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: 0,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: palette.text,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  pausedTag: {
    color: palette.warning,
    fontSize: type.caption.fontSize,
  },
  cardMeta: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  nextNight: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
  },
  cardBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  freshRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
});
