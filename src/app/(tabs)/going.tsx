import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { OfflineBanner } from '@/components/offline-banner';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useSession } from '@/features/auth/session';
import { MicCard } from '@/features/discovery/components/mic-card';
import { eventDate, eventTime } from '@/features/discovery/local-time';
import { goingStatusLabel } from '@/features/plans/summary';
import { useUpcomingNights, type UpcomingNight } from '@/features/plans/queries';
import { fonts, palette, spacing, type } from '@/theme';

/**
 * Every night this person said yes to, whether by signing up or by saying
 * they are coming. Sorted soonest first, because the only question this tab
 * answers is "where am I meant to be next".
 */
export default function GoingScreen() {
  const router = useRouter();
  const { session } = useSession();
  const nights = useUpcomingNights(session?.user.id);

  if (!session) {
    return (
      <Screen>
        <Title>Going</Title>
        <SignUpPrompt
          title="Keep every night you said yes to in one place"
          reason="Signups and plans live with your account, so the nights you committed to follow you to any device."
          perks={[
            'Your slot number, live, as a list fills',
            'A heads up when you are on deck',
            'Cancelled nights show here before you head out',
          ]}
        />
      </Screen>
    );
  }
  if (nights.isPending) {
    return <LoadingView label="Loading your nights" />;
  }
  if (nights.isError) {
    return (
      <Screen>
        <Title>Going</Title>
        <ErrorText>Could not load your nights. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => nights.refetch()} />
      </Screen>
    );
  }
  if (nights.data.length === 0) {
    return (
      <Screen>
        <Title>Nothing lined up yet</Title>
        <Body>
          Sign up for a slot or tap &quot;I am going&quot; on any mic and it lands here, soonest
          first. On a walk-in night, saying you are going also tells the host how many to expect.
        </Body>
        <Button label="Find a mic" onPress={() => router.push('/(tabs)')} />
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <FlatList
        data={nights.data}
        keyExtractor={(n) => n.occurrence_id ?? String(n.series_id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={nights.isFetching}
            onRefresh={nights.refetch}
            tintColor={palette.textSecondary}
          />
        }
        renderItem={({ item }) => <NightRow night={item} onPress={() => open(router, item)} />}
      />
    </View>
  );
}

function open(router: ReturnType<typeof useRouter>, night: UpcomingNight) {
  if (night.series_id) {
    router.push(`/mic/${night.series_id}`);
  }
}

function NightRow({ night, onPress }: { night: UpcomingNight; onPress: () => void }) {
  const cancelled = night.occurrence_status === 'cancelled';
  const status = goingStatusLabel(night);
  const statusColor = cancelled
    ? palette.warning
    : night.on_deck_at
      ? palette.warning
      : night.signup_status
        ? palette.success
        : palette.textSecondary;

  return (
    <View style={styles.row}>
      {/* The date leads, because the card below shows the recurring schedule
          and this tab is about one specific night. */}
      <View style={styles.headline}>
        <Text style={[styles.when, cancelled && styles.struck]}>
          {night.starts_at ? eventDate(night.starts_at, night.timezone) : 'Date to be confirmed'}
          {night.starts_at ? ` · ${eventTime(night.starts_at, night.timezone)}` : ''}
        </Text>
        <Text style={[styles.status, { color: statusColor }]}>{status}</Text>
      </View>
      <MicCard
        mic={{
          series_id: night.series_id ?? '',
          title: night.title ?? 'Open mic',
          disciplines: night.disciplines ?? [],
          signup_method: night.signup_method ?? 'first_come',
          cost_cents: night.cost_cents ?? 0,
          rrule: night.rrule ?? '',
          start_time: night.start_time ?? '',
          timezone: night.timezone,
          last_confirmed_at: night.last_confirmed_at,
          venue_name: night.venue_name ?? '',
          neighborhood: night.neighborhood,
          distance_m: null,
          next_starts_at: night.starts_at,
          poster_url: night.poster_url,
          featured_name: night.featured_name,
          // The going feed does not resolve credits; a null host simply
          // hides the line, same as the spots count below.
          host_name: null,
          // You are already on this night; the count belongs where the
          // decision is made, not here.
          spots_left: null,
        }}
        onPress={onPress}
      />
      {cancelled ? (
        <Text style={styles.cancelNote}>
          This night is off{night.cancellation_note ? `: ${night.cancellation_note}` : ''}.
        </Text>
      ) : null}
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
  row: {
    gap: spacing.xs,
  },
  headline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  when: {
    color: palette.text,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  struck: {
    color: palette.textSecondary,
    textDecorationLine: 'line-through',
  },
  status: {
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
  },
  cancelNote: {
    color: palette.warning,
    fontSize: type.caption.fontSize,
  },
});
