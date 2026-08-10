/**
 * A featured artist or host on a listing.
 *
 * The socials are the point. Someone deciding whether to come out for a
 * feature they do not know will go and listen first, so the links sit right
 * under the name as logos rather than being buried on a profile.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarCircle } from '@/features/profile/avatar-circle';
import { SocialLinkRow } from '@/components/social-links';
import { buildSocialLinks } from '@/features/profile/social';
import { fonts, maxFontScale, minTouchTarget, palette, radius, spacing, type } from '@/theme';

import { creditName, type Credit, type CreditRole } from '../resolve';

const ROLE_LABEL: Record<CreditRole, string> = {
  host: 'Hosted by',
  featured: 'Featured',
};

export function CreditCard({
  credit,
  role,
  /** Says so when tonight differs from what the series usually does. */
  overridden = false,
  /**
   * Opens the report flow for this credit. A producer can attach any account
   * to their listing without asking, which puts that person's name, photo,
   * and links on a mic they may have nothing to do with. The person it names
   * needs somewhere to say so, and reporting the whole listing is a different
   * claim about a different thing.
   */
  onReport,
}: {
  credit: Credit;
  role: CreditRole;
  overridden?: boolean;
  onReport?: () => void;
}) {
  const name = creditName(credit);
  const links = buildSocialLinks(credit);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <AvatarCircle url={credit.avatar_url} name={name} size={44} />
        <View style={styles.text}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.role}>
            {ROLE_LABEL[role]}
            {overridden ? ' tonight' : ''}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
        {onReport ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Report this credit for ${name}`}
            accessibilityHint="Use this if this person is not actually on this mic"
            hitSlop={8}
            onPress={onReport}
            style={({ pressed }) => [styles.report, pressed && styles.reportPressed]}
          >
            <Ionicons name="flag-outline" size={16} color={palette.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {links.length > 0 ? <SocialLinkRow links={links} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  role: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    textTransform: 'uppercase',
  },
  name: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.body.fontSize,
  },
  report: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
  },
  reportPressed: {
    opacity: 0.6,
  },
});
