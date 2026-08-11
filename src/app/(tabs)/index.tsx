import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Body, Button, ErrorText } from '@/components/ui';
import { useOwnProfile, usePerformerDisciplines } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { FilterBar } from '@/features/discovery/components/filter-bar';
import { MicCard } from '@/features/discovery/components/mic-card';
import { MicMap } from '@/features/discovery/components/mic-map';
import { SearchPanel } from '@/features/discovery/components/search-panel';
import { SkeletonCards } from '@/features/discovery/components/skeleton-card';
import { radiusLabel } from '@/features/discovery/distance';
import { DEFAULT_CENTER, requestForegroundLocation } from '@/features/discovery/location';
import { parseQueryTokens } from '@/features/discovery/query-tokens';
import {
  useDiscoverFeed,
  useSearchRecovery,
  type SearchRecovery,
} from '@/features/discovery/queries';
import { geocodeHomeArea } from '@/features/profile/geocode';
import { homeAreaLabel } from '@/features/profile/home-area';
import { logZeroResultSearch } from '@/lib/sentry';
import { userMessage } from '@/lib/user-error';
import { selectDiscoveryFilters, useFiltersStore } from '@/stores/filters';
import { useRecentSearches } from '@/stores/recent-searches';
import {
  type Discipline,
  fonts,
  maxFontScale,
  minTouchTarget,
  palette,
  radius,
  spacing,
  type,
} from '@/theme';

/**
 * Discover: one input, one feed. An empty query is the ranked nearby
 * feed; typing narrows the same feed, with every filter chip still
 * applied and visible. Temporal words in the query ("tonight",
 * "tuesday", "free") become the same chips a tap would set, so results
 * never change for an invisible reason.
 */
export default function DiscoverScreen() {
  const router = useRouter();
  const filters = useFiltersStore();
  const view = useFiltersStore((s) => s.view);
  const setView = useFiltersStore((s) => s.setView);
  const seedDisciplines = useFiltersStore((s) => s.seedDisciplines);
  const addRecent = useRecentSearches((s) => s.addRecent);

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
  const [locationDenied, setLocationDenied] = useState(false);
  const [search, setSearch] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  // The settled query: what the feed actually asks the server.
  const [debouncedSearch, setDebouncedSearch] = useState('');

  async function locateMe() {
    // In-context explanation lives right on the button and note below;
    // the OS prompt fires only after this deliberate tap.
    setLocating(true);
    setLocationNote(null);
    const result = await requestForegroundLocation();
    setLocating(false);
    if (result.status === 'granted') {
      setLocationDenied(false);
      setManualCenter({ lat: result.lat, lng: result.lng, label: 'your location' });
    } else if (result.status === 'denied') {
      setLocationDenied(true);
      setLocationNote(
        'Location is off. Showing your home area instead. Turn it on in Settings to search right where you are.',
      );
    } else {
      setLocationDenied(false);
      setLocationNote('Could not get your location. Try again.');
    }
  }

  // One request per pause in typing, not one per keystroke. When typing
  // settles, the closed-set token pass runs first: "open mic tonight"
  // becomes the query "open mic" plus the Tonight chip, visibly lit in
  // the bar below, so results never change for an invisible reason.
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseQueryTokens(search);
      if (parsed.tokens.length === 0) {
        setDebouncedSearch(search);
        return;
      }
      const store = useFiltersStore.getState();
      // Days collect into one set ("monday tuesday" means both), applied
      // after any when token so the two never fight through setDays
      // clearing when and vice versa.
      const dayTokens = parsed.tokens.flatMap((t) => (t.kind === 'day' ? [t.day] : []));
      for (const token of parsed.tokens) {
        if (token.kind === 'when') {
          if (dayTokens.length === 0) {
            store.setWhen(token.when);
          }
        } else if (token.kind === 'day') {
          store.setDays(dayTokens);
        } else if (token.kind === 'free') {
          store.setFreeOnly(true);
        } else if (token.kind === 'age') {
          if (!store.ages.includes(token.age)) {
            store.toggleAge(token.age);
          }
        } else if (token.kind === 'nearMe') {
          void locateMe();
        }
      }
      setSearch(parsed.text);
      setDebouncedSearch(parsed.text);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const activeFilters = selectDiscoveryFilters(filters);
  const feed = useDiscoverFeed(activeFilters, center, debouncedSearch);
  const query = debouncedSearch.trim();

  const results = useMemo(() => feed.data ?? [], [feed.data]);
  const showingZero = feed.data !== undefined && results.length === 0;
  const recovery = useSearchRecovery(activeFilters, center, debouncedSearch, showingZero);

  // Every zero-result search is a thing somebody wanted and could not
  // find. The log of them is a product roadmap.
  useEffect(() => {
    if (showingZero) {
      logZeroResultSearch(query, activeFilters as unknown as Record<string, unknown>);
    }
    // Log once per settled zero, not per filter object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingZero, query]);

  // When every match came from the fuzzy pass, say so: silently showing
  // "Olympia" results for "Olymipa" reads as a wrong answer.
  const allFuzzy =
    query.length > 0 && results.length > 0 && results.every((r) => r.match_kind === 'fuzzy');

  const openMic = (seriesId: string) => {
    if (query.length > 0) {
      addRecent(query);
    }
    router.push(`/mic/${seriesId}`);
  };

  // Searching a place can move the whole browse experience there: type a
  // city, tap "Browse near", and the feed recenters.
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

  const showPanel = inputFocused && search.trim().length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search mics, venues, cities, or hosts"
          placeholder="Search mic, venue, city, or host"
          placeholderTextColor={palette.textFaint}
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onSubmitEditing={() => {
            if (search.trim()) {
              addRecent(search.trim());
            }
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
            onPress={() => setSearch('')}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={22} color={palette.text} />
          </Pressable>
        ) : null}
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
      {locationNote ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.locationNote}>
          {locationNote}
        </Text>
      ) : null}
      {locationDenied ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open system settings to allow location"
          onPress={() => Linking.openSettings().catch(() => null)}
          style={({ pressed }) => [styles.textLink, pressed && styles.textLinkPressed]}
        >
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.settingsLink}>
            Open settings
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.centerRow}>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.centerLabel}>
          Near {centerLabel}
        </Text>
        {manualCenter ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back to your home area"
            onPress={() => setManualCenter(null)}
            style={({ pressed }) => [styles.textLink, pressed && styles.textLinkPressed]}
          >
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.centerReset}>
              Back to home area
            </Text>
          </Pressable>
        ) : null}
      </View>
      {!manualCenter && !profileCenter && (session ? !profile.isPending : true) ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.locationNote}>
          Showing the default Seattle area, not your own. Use the locate button, or search your city
          and tap Browse near it.
        </Text>
      ) : null}

      {showPanel ? (
        <SearchPanel
          query={search}
          onPickRecent={(q) => setSearch(q)}
          onPickSaved={(sv) => {
            useFiltersStore.setState({ ...sv.filters });
            setSearch(sv.query);
          }}
        />
      ) : null}

      <FilterBar />

      {allFuzzy ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.fuzzyNote}>
          No exact matches for &quot;{query}&quot;. Showing close matches.
        </Text>
      ) : null}

      {feed.isPending ? (
        <SkeletonCards />
      ) : feed.isError && feed.data === undefined ? (
        <View style={styles.stateWrap}>
          <ErrorText>{userMessage(feed.error, 'Could not load mics. Try again.')}</ErrorText>
          <Button label="Try again" onPress={() => feed.refetch()} />
        </View>
      ) : showingZero ? (
        <ZeroResults
          query={query}
          radiusKm={filters.radiusKm}
          hasWhen={filters.when !== null || filters.days.length > 0}
          recovery={recovery.data ?? null}
          onWiden={(km) => filters.setRadiusKm(km)}
          onAnyDay={() => filters.setWhen(null)}
          onClearQuery={() => setSearch('')}
          onBrowseNear={() => browseNear(query)}
          placeSearch={placeSearch}
          onClearFilters={filters.reset}
        />
      ) : view === 'map' ? (
        <View style={styles.mapWrap}>
          <MicMap mics={results} center={center} onSelect={openMic} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(mic) => mic.series_id}
          renderItem={({ item }) => <MicCard mic={item} onPress={() => openMic(item.series_id)} />}
          contentContainerStyle={styles.list}
          // The first tap on a result opens it; it must not just dismiss
          // the keyboard.
          keyboardShouldPersistTaps="handled"
          // Refinements keep the previous rows on screen; this dims them so
          // the list never flashes empty but never lies about being current.
          style={feed.isPlaceholderData ? styles.stale : null}
          refreshControl={
            <RefreshControl
              refreshing={feed.isFetching && !feed.isPlaceholderData}
              onRefresh={feed.refetch}
              tintColor={palette.textSecondary}
            />
          }
        />
      )}
    </View>
  );
}

/**
 * Zero results is never a dead end: offer the same search wider, the same
 * search on other days, the feed without the query, and a way out of the
 * filters, in that order of usefulness.
 */
function ZeroResults({
  query,
  radiusKm,
  hasWhen,
  recovery,
  onWiden,
  onAnyDay,
  onClearQuery,
  onBrowseNear,
  placeSearch,
  onClearFilters,
}: {
  query: string;
  radiusKm: number;
  hasWhen: boolean;
  recovery: SearchRecovery;
  onWiden: (km: number) => void;
  onAnyDay: () => void;
  onClearQuery: () => void;
  onBrowseNear: () => void;
  placeSearch: 'idle' | 'busy' | 'failed';
  onClearFilters: () => void;
}) {
  return (
    <View style={styles.stateWrap}>
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.emptyTitle}>
        {query ? `No matches for "${query}"` : 'Nothing here right now'}
      </Text>
      <Body>
        {query
          ? // Text searches run unbounded, so the radius is not the reason.
            `Nothing anywhere matches that${hasWhen ? ' on the days you picked' : ''}.`
          : `Nothing within ${radiusLabel(radiusKm)}${hasWhen ? ' on the days you picked' : ''}.`}
      </Body>
      {recovery?.kind === 'radius' ? (
        <Button
          label={`${recovery.count} ${recovery.count === 1 ? 'mic' : 'mics'} within ${radiusLabel(recovery.radiusKm)}`}
          onPress={() => onWiden(recovery.radiusKm)}
        />
      ) : null}
      {recovery?.kind === 'window' ? (
        <Button
          label={`${recovery.count} ${recovery.count === 1 ? 'mic' : 'mics'} on other days`}
          onPress={onAnyDay}
        />
      ) : null}
      {query ? (
        <>
          <Button label="Show nearby mics instead" kind="secondary" onPress={onClearQuery} />
          <Button
            label={`Browse near "${query}"`}
            kind="secondary"
            busy={placeSearch === 'busy'}
            onPress={onBrowseNear}
          />
          {placeSearch === 'failed' ? (
            <ErrorText>Could not find that place. Try a city name, like Portland, OR.</ErrorText>
          ) : null}
        </>
      ) : null}
      <Button label="Clear all filters" kind="secondary" onPress={onClearFilters} />
      <Body>Know a mic we are missing? Add it from the My mics tab.</Body>
    </View>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  searchInput: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.borderInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: palette.text,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: type.body.fontSize,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: minTouchTarget,
    justifyContent: 'center',
    width: minTouchTarget,
  },
  locationNote: {
    color: palette.warning,
    fontFamily: fonts.regular,
    fontSize: type.caption.fontSize,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  // Text links still get a full-size touch box.
  textLink: {
    justifyContent: 'center',
    minHeight: minTouchTarget,
  },
  textLinkPressed: {
    opacity: 0.6,
  },
  settingsLink: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
    paddingHorizontal: spacing.lg,
    textDecorationLine: 'underline',
  },
  centerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  centerLabel: {
    color: palette.textSecondary,
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: type.caption.fontSize,
  },
  centerReset: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
    textDecorationLine: 'underline',
  },
  fuzzyNote: {
    color: palette.warning,
    fontFamily: fonts.regular,
    fontSize: type.caption.fontSize,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  mapWrap: {
    flex: 1,
  },
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  stale: {
    opacity: 0.6,
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
});
