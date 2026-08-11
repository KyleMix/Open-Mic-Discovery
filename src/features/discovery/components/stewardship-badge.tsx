import { StyleSheet, Text } from 'react-native';

import { fonts, maxFontScale, palette, type } from '@/theme';

export type Stewardship = { ownerId: string | null };

/**
 * Whether a discovery RPC row carries stewardship data. The owner_id
 * column arrives with migration 20260804000100; until it is applied the
 * generated types and rows lack the field, and the card shows no badge
 * at all rather than a wrong or placeholder one.
 */
export function cardStewardship(row: object): Stewardship | null {
  const raw = (row as { owner_id?: string | null }).owner_id;
  return raw === undefined ? null : { ownerId: raw };
}

export function stewardshipLabel(ownerId: string | null, verified: boolean): string {
  return ownerId ? (verified ? 'Verified host' : 'Host-managed') : 'Community-listed';
}

function stewardshipA11y(ownerId: string | null, verified: boolean): string {
  return ownerId
    ? verified
      ? 'Run by a verified host'
      : 'Run by its host'
    : 'Community-listed, not yet claimed by its host';
}

type Props = {
  ownerId: string | null;
  /** Only the detail screen has the producer_public lookup; cards omit it. */
  verified?: boolean;
  /** 'card' keeps the badge quiet next to the mic name and time. */
  variant?: 'detail' | 'card';
};

/**
 * Who stands behind a listing: a verified host, its host, or the
 * community that entered it. One component for the detail screen and the
 * compact card meta row, so the wording and colors cannot drift.
 */
export function StewardshipBadge({ ownerId, verified = false, variant = 'detail' }: Props) {
  return (
    <Text
      accessibilityLabel={stewardshipA11y(ownerId, verified)}
      maxFontSizeMultiplier={maxFontScale}
      style={[
        styles.badge,
        variant === 'detail' && styles.detail,
        verified && { color: palette.success },
      ]}
    >
      {stewardshipLabel(ownerId, verified)}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    color: palette.textSecondary,
    fontFamily: fonts.regular,
    fontSize: type.caption.fontSize,
  },
  detail: {
    fontFamily: fonts.regular,
  },
});
