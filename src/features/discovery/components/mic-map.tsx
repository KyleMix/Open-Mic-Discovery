import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import Supercluster from 'supercluster';

import { Glyph, disciplineGlyphs } from '@/components/glyph';
import { formatNextDate } from '@/features/discovery/components/mic-card';
import type { NearbyMic } from '@/features/discovery/queries';
import { disciplineAccents, fonts, palette, type Discipline } from '@/theme';

type Props = {
  mics: NearbyMic[];
  center: { lat: number; lng: number };
  onSelect: (seriesId: string) => void;
};

type PointProperties = {
  seriesId: string;
  discipline: Discipline;
  multi: boolean;
  title: string;
  venueName: string | null;
  nextDate: string | null;
};

const INITIAL_DELTA = 0.35;

function regionToZoom(region: Region): number {
  return Math.round(Math.log2(360 / region.longitudeDelta));
}

/**
 * Map with supercluster-backed marker clustering. Markers use the discipline
 * accent and glyph; mixed-discipline mics render neutral with a layered dot.
 */
export function MicMap({ mics, center, onSelect }: Props) {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>({
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: INITIAL_DELTA,
    longitudeDelta: INITIAL_DELTA,
  });

  const index = useMemo(() => {
    const cluster = new Supercluster<PointProperties>({ radius: 52, maxZoom: 16 });
    cluster.load(
      mics.map((mic) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [mic.lng, mic.lat] },
        properties: {
          seriesId: mic.series_id,
          discipline: (mic.disciplines[0] ?? 'other') as Discipline,
          multi: mic.disciplines.length > 1,
          title: mic.title,
          venueName: mic.venue_name ?? null,
          nextDate: mic.next_starts_at ? formatNextDate(mic.next_starts_at, mic.timezone) : null,
        },
      })),
    );
    return cluster;
  }, [mics]);

  const clusters = useMemo(() => {
    const pad = 0.2;
    return index.getClusters(
      [
        region.longitude - region.longitudeDelta * (0.5 + pad),
        region.latitude - region.latitudeDelta * (0.5 + pad),
        region.longitude + region.longitudeDelta * (0.5 + pad),
        region.latitude + region.latitudeDelta * (0.5 + pad),
      ],
      regionToZoom(region),
    );
  }, [index, region]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      onRegionChangeComplete={setRegion}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      accessibilityLabel="Map of open mics"
    >
      {clusters.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        // GeoJSON positions always carry two numbers; supercluster never
        // emits fewer. The guard keeps the map rendering if one ever arrives
        // malformed instead of crashing the whole screen.
        if (lng === undefined || lat === undefined) {
          return null;
        }
        if ('cluster' in feature.properties && feature.properties.cluster) {
          const clusterId = feature.properties.cluster_id;
          const count = feature.properties.point_count;
          return (
            <Marker
              key={`cluster-${clusterId}`}
              coordinate={{ latitude: lat, longitude: lng }}
              accessibilityLabel={`${count} open mics here. Zooms in.`}
              onPress={() => {
                const zoom = Math.min(index.getClusterExpansionZoom(clusterId), 18);
                const delta = 360 / 2 ** zoom;
                mapRef.current?.animateToRegion(
                  { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta },
                  250,
                );
              }}
            >
              <View style={styles.cluster}>
                <Text style={styles.clusterCount}>{count}</Text>
              </View>
            </Marker>
          );
        }
        const props = feature.properties as PointProperties;
        const color = props.multi ? palette.text : disciplineAccents[props.discipline];
        return (
          <Marker
            key={props.seriesId}
            coordinate={{ latitude: lat, longitude: lng }}
            accessibilityLabel={markerLabel(props)}
            onPress={() => onSelect(props.seriesId)}
          >
            {/* The 44pt outer box is the touch target; the 36pt circle
                stays the visual, matching the pin size everywhere else. */}
            <View style={styles.pinTouch}>
              <View style={[styles.pin, { borderColor: color }]}>
                <Glyph name={disciplineGlyphs[props.discipline]} size={16} color={color} />
              </View>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

/**
 * Ten pins that all announce "Open mic" are indistinguishable to a screen
 * reader; the name is the point of the pin.
 */
function markerLabel(props: PointProperties): string {
  const parts = [props.title, props.venueName, props.nextDate].filter(
    (part): part is string => !!part,
  );
  return parts.length > 0 ? parts.join(', ') : 'Open mic';
}

const styles = StyleSheet.create({
  pinTouch: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pin: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  // Min sizes, not fixed: a two-digit count under large type grows the
  // circle instead of clipping.
  cluster: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.text,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  clusterCount: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
});
