import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, palette } from '@/theme';

/** Round profile photo, falling back to the person's first initial. */
export function AvatarCircle({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: number;
}) {
  const radius = size / 2;
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityLabel={`${name}'s photo`}
        style={{ borderRadius: radius, height: size, width: size }}
        contentFit="cover"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      accessibilityLabel={`${name}'s photo placeholder`}
      style={[styles.fallback, { borderRadius: radius, height: size, width: size }]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    backgroundColor: palette.bgPressed,
    borderColor: palette.border,
    borderWidth: 1,
    justifyContent: 'center',
  },
  initial: {
    color: palette.text,
    fontFamily: fonts.semibold,
  },
});
