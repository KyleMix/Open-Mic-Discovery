import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph } from '@/components/glyph';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { freshness } from '@/features/discovery/freshness';
import { describeRecurrence } from '@/features/discovery/recurrence';
import { useFavorites, useToggleFavorite } from '@/features/favorites/queries';
import { fonts, palette, spacing, type } from '@/theme';

export default function FavoritesScreen() {
  const router = useRouter();
  const { session } = useSession();
  const favorites = useFavorites(session?.user.id);
  const toggle = useToggleFavorite();

  if (!session) {
    return (
      <Screen>
        <Title>Favorites</Title>
        <Body>Sign in to save the mics you love and get reminded on the day.</Body>
        <Button label="Sign in" onPress={() => router.push('/(auth)/sign-in')} />
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
      <FlatList
        data={favorites.data}
        keyExtractor={(f) => f.series_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const s = item.series;
          if (!s) {
            return null;
          }
          const fresh = freshness(s.last_confirmed_at, new Date());
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${s.title}`}
              onPress={() => router.push(`/mic/${s.id}`)}
              style={({ pressed }) => [
                styles.card,
                pressed && { backgroundColor: palette.bgPressed },
              ]}
            >
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={styles.cardMeta}>
                  {s.venue?.name}, {s.venue?.city} ·{' '}
                  {describeRecurrence(s.rrule, s.start_time) ?? 'Schedule varies'}
                </Text>
                <View style={styles.freshRow}>
                  <Glyph name="freshness-badge" size={14} color={fresh.color} />
                  <Text style={[styles.cardMeta, { color: fresh.color }]}>{fresh.label}</Text>
                </View>
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
            </Pressable>
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
  card: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    padding: spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  cardMeta: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  freshRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
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
