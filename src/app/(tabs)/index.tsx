import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, ErrorText, LoadingView } from '@/components/ui';
import { FilterBar } from '@/features/discovery/components/filter-bar';
import { MicCard, formatNextDate } from '@/features/discovery/components/mic-card';
import { MicMap } from '@/features/discovery/components/mic-map';
import { DEFAULT_CENTER, requestForegroundLocation } from '@/features/discovery/location';
import { useNearbyMics, useSearchMics } from '@/features/discovery/queries';
import { useFiltersStore } from '@/stores/filters';
import { fonts, minTouchTarget, palette, spacing, type } from '@/theme';

export default function DiscoverScreen() {
  const router = useRouter();
  const filters = useFiltersStore();
  const view = useFiltersStore((s) => s.view);
  const setView = useFiltersStore((s) => s.setView);

  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const nearby = useNearbyMics(filters, center);
  const searchResults = useSearchMics(search);
  const searching = search.trim().length >= 2;

  async function locateMe() {
    // In-context explanation lives right on the button and note below;
    // the OS prompt fires only after this deliberate tap.
    setLocating(true);
    setLocationNote(null);
    const result = await requestForegroundLocation();
    setLocating(false);
    if (result.status === 'granted') {
      setCenter({ lat: result.lat, lng: result.lng });
    } else if (result.status === 'denied') {
      setLocationNote(
        'Location is off. Showing Seattle. Enable location in Settings to search near you.',
      );
    } else {
      setLocationNote('Could not get your location. Try again.');
    }
  }

  const openMic = (seriesId: string) => router.push(`/mic/${seriesId}`);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search by city or venue"
          placeholder="Search city or venue"
          placeholderTextColor={palette.textDisabled}
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use my location to find mics near me"
          accessibilityHint="Asks for location permission, used only while you use the app"
          onPress={locateMe}
          disabled={locating}
          style={styles.iconButton}
        >
          <Ionicons
            name="locate"
            size={22}
            color={locating ? palette.textDisabled : palette.text}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view === 'map' ? 'Switch to list view' : 'Switch to map view'}
          onPress={() => setView(view === 'map' ? 'list' : 'map')}
          style={styles.iconButton}
        >
          <Ionicons name={view === 'map' ? 'list' : 'map'} size={22} color={palette.text} />
        </Pressable>
      </View>
      {locationNote ? <Text style={styles.locationNote}>{locationNote}</Text> : null}

      {searching ? (
        <SearchResults state={searchResults} onSelect={openMic} />
      ) : (
        <>
          <FilterBar />
          {nearby.isPending ? (
            <LoadingView label="Finding mics" />
          ) : nearby.isError ? (
            <View style={styles.stateWrap}>
              <ErrorText>Could not load mics. Check your connection.</ErrorText>
              <Button label="Try again" onPress={() => nearby.refetch()} />
            </View>
          ) : nearby.data.length === 0 ? (
            <View style={styles.stateWrap}>
              <Text style={styles.emptyTitle}>No mics here yet</Text>
              <Body>
                Nothing within {filters.radiusKm} km with these filters. Widen the radius, clear
                filters, or be the one who puts this scene on the map: producer tools for adding a
                mic arrive in the My Mics tab.
              </Body>
            </View>
          ) : view === 'map' ? (
            <View style={styles.mapWrap}>
              <MicMap mics={nearby.data} center={center} onSelect={openMic} />
            </View>
          ) : (
            <FlatList
              data={nearby.data}
              keyExtractor={(mic) => mic.series_id}
              renderItem={({ item }) => (
                <MicCard mic={item} onPress={() => openMic(item.series_id)} />
              )}
              contentContainerStyle={styles.list}
            />
          )}
        </>
      )}
    </View>
  );
}

function SearchResults({
  state,
  onSelect,
}: {
  state: ReturnType<typeof useSearchMics>;
  onSelect: (seriesId: string) => void;
}) {
  if (state.isPending || state.isLoading) {
    return <LoadingView label="Searching" />;
  }
  if (state.isError) {
    return (
      <View style={styles.stateWrap}>
        <ErrorText>Search failed. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => state.refetch()} />
      </View>
    );
  }
  if (!state.data || state.data.length === 0) {
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.emptyTitle}>No matches</Text>
        <Body>No mic, venue, or city matches that search.</Body>
      </View>
    );
  }
  return (
    <FlatList
      data={state.data}
      keyExtractor={(r) => r.series_id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title} in ${item.city}`}
          onPress={() => onSelect(item.series_id)}
          style={({ pressed }) => [
            styles.searchResult,
            pressed && { backgroundColor: palette.bgPressed },
          ]}
        >
          <Text style={styles.searchResultTitle}>{item.title}</Text>
          <Text style={styles.searchResultMeta}>
            {item.venue_name}, {item.city} · {formatNextDate(item.next_starts_at)}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  searchInput: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 10,
    borderWidth: 1,
    color: palette.text,
    flex: 1,
    fontSize: type.body.fontSize,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 10,
    borderWidth: 1,
    height: minTouchTarget,
    justifyContent: 'center',
    width: minTouchTarget,
  },
  locationNote: {
    color: palette.warning,
    fontSize: type.caption.fontSize,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  mapWrap: {
    flex: 1,
  },
  list: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  stateWrap: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  searchResult: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  searchResultTitle: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  searchResultMeta: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
});
