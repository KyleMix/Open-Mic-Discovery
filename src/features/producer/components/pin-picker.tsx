import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { DEFAULT_CENTER } from '@/features/discovery/location';
import { palette, radius } from '@/theme';

export type Pin = { lat: number; lng: number };

type Props = {
  pin: Pin | null;
  onChange: (pin: Pin) => void;
};

/** Native venue pin-drop: tap the map to place the venue, or drag it after the
 * address lookup has placed it. */
export function PinPicker({ pin, onChange }: Props) {
  const map = useRef<MapView | null>(null);
  const lat = pin?.lat;
  const lng = pin?.lng;

  // The address lookup sets the pin from outside, and the map opens on the
  // default center, so without this the marker lands off screen and the
  // producer sees an empty map as if nothing happened.
  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      return;
    }
    map.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      400,
    );
  }, [lat, lng]);

  return (
    <View style={styles.mapBox}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: pin?.lat ?? DEFAULT_CENTER.lat,
          longitude: pin?.lng ?? DEFAULT_CENTER.lng,
          latitudeDelta: pin ? 0.01 : 0.2,
          longitudeDelta: pin ? 0.01 : 0.2,
        }}
        onPress={(e) =>
          onChange({
            lat: e.nativeEvent.coordinate.latitude,
            lng: e.nativeEvent.coordinate.longitude,
          })
        }
        accessibilityLabel="Map for placing the venue pin"
      >
        {pin ? (
          <Marker
            draggable
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            onDragEnd={(e) =>
              onChange({
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              })
            }
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapBox: {
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 220,
    overflow: 'hidden',
  },
});
