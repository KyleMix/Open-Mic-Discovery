import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { transformedImageUrl } from '@/lib/image-url';
import { fonts, maxFontScale, palette } from '@/theme';

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
        // Asking for twice the layout size keeps it sharp on a retina screen
        // while still being far smaller than the original upload.
        source={{ uri: transformedImageUrl(url, { width: size * 2, height: size * 2 })! }}
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
      <Text maxFontSizeMultiplier={maxFontScale} style={[styles.initial, { fontSize: size * 0.4 }]}>
        {initial}
      </Text>
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
