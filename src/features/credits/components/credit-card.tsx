/**
 * A featured artist or host on a listing.
 *
 * The socials are the point. Someone deciding whether to come out for a
 * feature they do not know will go and listen first, so the links sit right
 * under the name as logos rather than being buried on a profile.
 */
import { StyleSheet, Text, View } from 'react-native';

import { AvatarCircle } from '@/features/profile/avatar-circle';
import { SocialLinkRow } from '@/components/social-links';
import { buildSocialLinks } from '@/features/profile/social';
import { fonts, palette, spacing, type } from '@/theme';

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
}: {
  credit: Credit;
  role: CreditRole;
  overridden?: boolean;
}) {
  const name = creditName(credit);
  const links = buildSocialLinks(credit);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <AvatarCircle url={credit.avatar_url} name={name} size={44} />
        <View style={styles.text}>
          <Text style={styles.role}>
            {ROLE_LABEL[role]}
            {overridden ? ' tonight' : ''}
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
      </View>
      {links.length > 0 ? <SocialLinkRow links={links} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
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
    gap: 2,
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
});
