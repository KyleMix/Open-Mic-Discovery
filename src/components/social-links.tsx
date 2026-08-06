/**
 * Social links as logo buttons.
 *
 * A row of wordmarks ("Instagram", "TikTok", "Spotify") reads as a list of
 * words and takes a moment to scan. Logos are recognised before they are
 * read, which is what you want on a listing someone is skimming to decide
 * whether to go out tonight.
 *
 * The label does not disappear, it moves to the accessibility label: a button
 * whose entire content is a glyph is unusable with a screen reader otherwise.
 */
import { FontAwesome6 } from '@expo/vector-icons';
import type { ComponentType } from 'react';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, View } from 'react-native';

import type { SocialKey, SocialLink } from '@/features/profile/social';
import { minTouchTarget, palette, spacing } from '@/theme';

type IconProps = {
  name: string;
  size: number;
  color: string;
  iconStyle?: 'brand' | 'solid';
};

// @expo/vector-icons ships FontAwesome6 typed as any. Casting once here keeps
// that untyped surface to a single line instead of spreading through the file.
const Icon = FontAwesome6 as unknown as ComponentType<IconProps>;

type IconSpec = { name: string; brand: boolean; color: string };

/**
 * Brand colours, because a Spotify button that is not green reads as
 * decoration rather than as Spotify. TikTok and Apple both use monochrome
 * marks, so they take the foreground colour and stay legible on the dark
 * background.
 */
export const SOCIAL_ICONS: Record<SocialKey, IconSpec> = {
  instagram: { name: 'instagram', brand: true, color: '#E1306C' },
  tiktok: { name: 'tiktok', brand: true, color: palette.text },
  youtube: { name: 'youtube', brand: true, color: '#FF0000' },
  spotify: { name: 'spotify', brand: true, color: '#1DB954' },
  apple_music: { name: 'apple', brand: true, color: palette.text },
  website: { name: 'globe', brand: false, color: palette.textSecondary },
};

export function SocialLinkRow({ links }: { links: SocialLink[] }) {
  if (links.length === 0) {
    return null;
  }
  return (
    <View style={styles.row}>
      {links.map((link) => {
        const icon = SOCIAL_ICONS[link.key];
        return (
          <Pressable
            key={link.key}
            accessibilityRole="link"
            accessibilityLabel={`Open ${link.label}`}
            onPress={() => Linking.openURL(link.url).catch(() => null)}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Icon
              name={icon.name}
              size={22}
              color={icon.color}
              iconStyle={icon.brand ? 'brand' : 'solid'}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  button: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: minTouchTarget / 2,
    borderWidth: 1,
    height: minTouchTarget,
    justifyContent: 'center',
    width: minTouchTarget,
  },
  buttonPressed: {
    backgroundColor: palette.bgPressed,
  },
});
