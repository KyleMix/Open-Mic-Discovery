import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { DEFAULT_CENTER } from '@/features/discovery/location';
import { palette } from '@/theme';

export type Pin = { lat: number; lng: number };

type Props = {
  pin: Pin | null;
  onChange: (pin: Pin) => void;
};

/** Native venue pin-drop: tap the map to place the venue. */
export function PinPicker({ pin, onChange }: Props) {
  return (
    <View style={styles.mapBox}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: DEFAULT_CENTER.lat,
          longitude: DEFAULT_CENTER.lng,
          latitudeDelta: 0.2,
          longitudeDelta: 0.2,
        }}
        onPress={(e) =>
          onChange({
            lat: e.nativeEvent.coordinate.latitude,
            lng: e.nativeEvent.coordinate.longitude,
          })
        }
        accessibilityLabel="Map for placing the venue pin"
      >
        {pin ? <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} /> : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapBox: {
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 220,
    overflow: 'hidden',
  },
});
