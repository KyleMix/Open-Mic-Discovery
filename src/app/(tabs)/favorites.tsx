import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useSession } from '@/features/auth/session';
import { OfflineBanner } from '@/components/offline-banner';
import { MicCard } from '@/features/discovery/components/mic-card';
import { useFavorites, useToggleFavorite } from '@/features/favorites/queries';
import { palette, spacing } from '@/theme';

export default function FavoritesScreen() {
  const router = useRouter();
  const { session } = useSession();
  const favorites = useFavorites(session?.user.id);
  const toggle = useToggleFavorite();

  if (!session) {
    return (
      <Screen>
        <Title>Favorites</Title>
        <SignUpPrompt
          title="Keep the mics you actually go to"
          reason="Favorites live with your account, so they follow you to any device."
          perks={[
            'A nudge on the morning of a mic you saved',
            'Told when a new mic opens near you',
            'One weekly summary of what is on',
          ]}
        />
      </Screen>
    );
  }
  if (favorites.isPending) {
    return <LoadingView label="Loading favorites" />;
  }
  if (favorites.isError) {
    return (
      <Screen>
        <Title>Favorites</Title>
        <ErrorText>Could not load favorites. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => favorites.refetch()} />
      </Screen>
    );
  }
  if (favorites.data.length === 0) {
    return (
      <Screen>
        <Title>No favorites yet</Title>
        <Body>
          Tap the star on any listing to keep it here. Favorites can remind you on the day of the
          mic (Settings, Notification preferences).
        </Body>
        <Button label="Find a mic" onPress={() => router.push('/(tabs)')} />
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <FlatList
        data={favorites.data}
        keyExtractor={(f) => f.series_id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={favorites.isFetching}
            onRefresh={favorites.refetch}
            tintColor={palette.textSecondary}
          />
        }
        renderItem={({ item }) => {
          const s = item.series;
          if (!s) {
            return null;
          }
          return (
            <View style={styles.row}>
              <View style={styles.cardWrap}>
                {/* Same card as Discover and search, so a saved mic reads
                    identically to the one that was saved. */}
                <MicCard
                  mic={{
                    series_id: s.id,
                    title: s.title,
                    disciplines: s.disciplines,
                    signup_method: s.signup_method,
                    cost_cents: s.cost_cents,
                    rrule: s.rrule,
                    start_time: s.start_time,
                    timezone: s.timezone,
                    last_confirmed_at: s.last_confirmed_at,
                    venue_name: s.venue?.name ?? '',
                    neighborhood: s.venue?.neighborhood ?? s.venue?.city ?? null,
                    distance_m: null,
                    next_starts_at: null,
                    poster_url: s.poster_url,
                    // Favorites read the series, not a night, so there is no
                    // guest to name and no night to count spots against.
                    featured_name: null,
                    spots_left: null,
                  }}
                  onPress={() => router.push(`/mic/${s.id}`)}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${s.title} from favorites`}
                onPress={() =>
                  toggle.mutate({ userId: session.user.id, seriesId: s.id, favorite: false })
                }
                style={styles.unfavorite}
              >
                <Text style={styles.star}>★</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cardWrap: {
    flex: 1,
  },
  container: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  list: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  unfavorite: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  star: {
    color: palette.warning,
    fontSize: 22,
  },
});
