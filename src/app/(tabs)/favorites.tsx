import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useSession } from '@/features/auth/session';
import { MicCard } from '@/features/discovery/components/mic-card';
import { useFavorites } from '@/features/favorites/queries';
import { palette, spacing, type Discipline } from '@/theme';

export default function FavoritesScreen() {
  const router = useRouter();
  const { session } = useSession();
  const favorites = useFavorites(session?.user.id);

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
  // Cached favorites stay readable through a failed refetch; the offline
  // banner marks the staleness.
  const favoriteRows = favorites.data;
  if (favoriteRows === undefined) {
    return (
      <Screen>
        <Title>Favorites</Title>
        <ErrorText>Could not load favorites. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => favorites.refetch()} />
      </Screen>
    );
  }
  if (favoriteRows.length === 0) {
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
      <FlatList
        data={favoriteRows}
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
          // Same card as Discover and search (its own star removes the
          // favorite), so a saved mic reads identically to the one saved.
          return (
            <MicCard
              mic={{
                series_id: s.id,
                title: s.title,
                disciplines: s.disciplines as Discipline[],
                signup_method: s.signup_method,
                cost_cents: s.cost_cents,
                rrule: s.rrule,
                start_time: s.start_time,
                timezone: s.timezone,
                last_confirmed_at: s.last_confirmed_at,
                venue_name: s.venue?.name ?? '',
                neighborhood: s.venue?.neighborhood ?? s.venue?.city ?? null,
                distance_m: null,
                next_starts_at: item.next_starts_at,
                poster_url: s.poster_url,
                // Favorites read the series, not a night, so there is no
                // guest or host to name and no night to count spots against.
                featured_name: null,
                host_name: null,
                spots_left: null,
              }}
              onPress={() => router.push(`/mic/${s.id}`)}
            />
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
    gap: spacing.sm,
    padding: spacing.md,
  },
});
