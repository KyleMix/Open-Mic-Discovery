import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Glyph } from '@/components/glyph';
import { Body, Button, ErrorText, LoadingView } from '@/components/ui';
import { freshness } from '@/features/discovery/freshness';
import { useOwnProfile, usePerformerDisciplines } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { FilterBar } from '@/features/discovery/components/filter-bar';
import { boundByDate } from '@/features/discovery/date-window';
import { MicCard, formatNextDate } from '@/features/discovery/components/mic-card';
import { MicMap } from '@/features/discovery/components/mic-map';
import { radiusLabel } from '@/features/discovery/distance';
import { DEFAULT_CENTER, requestForegroundLocation } from '@/features/discovery/location';
import { geocodeHomeArea } from '@/features/profile/geocode';
import { homeAreaLabel } from '@/features/profile/home-area';
import { sortSoonestNearest } from '@/features/discovery/order';
import { useNearbyMics, useSearchMics } from '@/features/discovery/queries';
import { useFiltersStore } from '@/stores/filters';
import { fonts, minTouchTarget, palette, spacing, type, type Discipline } from '@/theme';

export default function DiscoverScreen() {
  const router = useRouter();
  const filters = useFiltersStore();
  const view = useFiltersStore((s) => s.view);
  const setView = useFiltersStore((s) => s.setView);
  const seedDisciplines = useFiltersStore((s) => s.seedDisciplines);

  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const performerDisciplines = usePerformerDisciplines(session?.user.id);

  // Home base: the private home area from the profile. A tap on the locate
  // button or a "browse near" search overrides it for this session.
  const [manualCenter, setManualCenter] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const profileCenter =
    profile.data?.home_lat != null && profile.data?.home_lng != null
      ? { lat: profile.data.home_lat, lng: profile.data.home_lng }
      : null;
  const center = manualCenter
    ? { lat: manualCenter.lat, lng: manualCenter.lng }
    : (profileCenter ?? DEFAULT_CENTER);
  // Nothing on this screen said where results were centered; now it does.
  const centerLabel = manualCenter
    ? manualCenter.label
    : profileCenter
      ? (profile.data ? homeAreaLabel(profile.data) : null) || 'your home area'
      : 'Seattle (default area)';

  // First open defaults the discipline chips to what this performer does.
  useEffect(() => {
    if (performerDisciplines.data) {
      seedDisciplines(performerDisciplines.data as Discipline[]);
    }
  }, [performerDisciplines.data, seedDisciplines]);

  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // One search RPC per pause in typing, not one per keystroke.
  const debouncedSearch = useDebounced(search, 300);

  const nearby = useNearbyMics(filters, center);
  const searchResults = useSearchMics(debouncedSearch);
  const searching = search.trim().length >= 2;

  // The list leads with what is happening soonest, closest first. The
  // Tonight and This weekend quick picks additionally bound results to
  // their actual dates, not just their weekdays.
  const visibleMics = useMemo(
    () =>
      boundByDate(
        // Paused listings generate no nights; showing them as undated
        // cards reads as data rot, the exact thing the badge fights.
        sortSoonestNearest((nearby.data ?? []).filter((m) => m.is_active !== false)),
        filters.dateBound,
        new Date(),
      ),
    [nearby.data, filters.dateBound],
  );

  // Searching a place can move the whole browse experience there: type a
  // city, tap "Show mics near", and the filtered nearby view recenters.
  const [placeSearch, setPlaceSearch] = useState<'idle' | 'busy' | 'failed'>('idle');
  async function browseNear(place: string) {
    setPlaceSearch('busy');
    const coords = await geocodeHomeArea(place);
    if (coords) {
      setManualCenter({ ...coords, label: place });
      setSearch('');
      setLocationNote(null);
      setPlaceSearch('idle');
    } else {
      setPlaceSearch('failed');
    }
  }

  async function locateMe() {
    // In-context explanation lives right on the button and note below;
    // the OS prompt fires only after this deliberate tap.
    setLocating(true);
    setLocationNote(null);
    const result = await requestForegroundLocation();
    setLocating(false);
    if (result.status === 'granted') {
      setManualCenter({ lat: result.lat, lng: result.lng, label: 'your location' });
    } else if (result.status === 'denied') {
      setLocationNote(
        'Location is off. Showing your home area instead. Enable location in Settings to search right where you are.',
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
          placeholderTextColor={palette.textFaint}
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
      {!searching ? (
        <View style={styles.centerRow}>
          <Text style={styles.centerLabel}>Near {centerLabel}</Text>
          {manualCenter ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back to your home area"
              onPress={() => setManualCenter(null)}
            >
              <Text style={styles.centerReset}>Back to home area</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!searching && !manualCenter && !profileCenter && !profile.isPending ? (
        <Text style={styles.locationNote}>
          Showing the default Seattle area, not your own. Use the locate button, or search your
          city and tap Show mics near it.
        </Text>
      ) : null}

      {searching ? (
        <SearchResults
          state={searchResults}
          onSelect={openMic}
          query={search.trim()}
          placeSearch={placeSearch}
          onBrowseNear={browseNear}
        />
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
          ) : visibleMics.length === 0 ? (
            <View style={styles.stateWrap}>
              <Text style={styles.emptyTitle}>
                {filters.dateBound === 'today'
                  ? 'Nothing on tonight'
                  : filters.dateBound === 'weekend'
                    ? 'Nothing on this weekend'
                    : 'No mics here yet'}
              </Text>
              <Body>
                Nothing within {radiusLabel(filters.radiusKm)} matches. Try a bigger distance or
                clear the filters. Know a mic we are missing? Add it from the My Mics tab.
              </Body>
              <Button label="Clear all filters" kind="secondary" onPress={filters.reset} />
            </View>
          ) : view === 'map' ? (
            <View style={styles.mapWrap}>
              <MicMap mics={visibleMics} center={center} onSelect={openMic} />
            </View>
          ) : (
            <FlatList
              data={visibleMics}
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

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function SearchResults({
  state,
  onSelect,
  query,
  placeSearch,
  onBrowseNear,
}: {
  state: ReturnType<typeof useSearchMics>;
  onSelect: (seriesId: string) => void;
  query: string;
  placeSearch: 'idle' | 'busy' | 'failed';
  onBrowseNear: (place: string) => void;
}) {
  const browseButton = (
    <View style={styles.browseNear}>
      <Button
        label={`Show mics near "${query}"`}
        kind="secondary"
        busy={placeSearch === 'busy'}
        onPress={() => onBrowseNear(query)}
      />
      {placeSearch === 'failed' ? (
        <ErrorText>Could not find that place. Try a city name, like Portland, OR.</ErrorText>
      ) : null}
    </View>
  );

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
        <Body>No mic, venue, or city matches that search by name.</Body>
        {browseButton}
      </View>
    );
  }
  return (
    <FlatList
      data={state.data}
      keyExtractor={(r) => r.series_id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={browseButton}
      renderItem={({ item }) => {
        const fresh = freshness(item.last_confirmed_at, new Date());
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} in ${item.city}, ${fresh.label}`}
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
            <View style={styles.searchResultFresh}>
              <Glyph name="freshness-badge" size={14} color={fresh.color} />
              <Text style={[styles.searchResultMeta, { color: fresh.color }]}>{fresh.label}</Text>
            </View>
          </Pressable>
        );
      }}
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
  centerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  centerLabel: {
    color: palette.textSecondary,
    flexShrink: 1,
    fontSize: type.caption.fontSize,
  },
  centerReset: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
    textDecorationLine: 'underline',
  },
  browseNear: {
    gap: spacing.sm,
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
  searchResultFresh: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
});
