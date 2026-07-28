import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph, disciplineGlyphs, signupMethodGlyphs } from '@/components/glyph';
import { freshness } from '@/features/discovery/freshness';
import type { NearbyMic } from '@/features/discovery/queries';
import { describeRecurrence } from '@/features/discovery/recurrence';
import { disciplineAccents, fonts, palette, spacing, type, type Discipline } from '@/theme';

export const SIGNUP_METHOD_LABELS: Record<NearbyMic['signup_method'], string> = {
  lottery: 'Lottery',
  first_come: 'First come',
  reserved_slot: 'Reserved slots',
  host_booked: 'Host booked',
};

export function formatNextDate(startsAt: string | null): string {
  if (!startsAt) {
    return 'No upcoming date';
  }
  const date = new Date(startsAt);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function costLabel(costCents: number): string {
  return costCents === 0 ? 'Free' : `$${(costCents / 100).toFixed(costCents % 100 === 0 ? 0 : 2)}`;
}

type Props = {
  mic: NearbyMic;
  onPress: () => void;
};

export function MicCard({ mic, onPress }: Props) {
  const fresh = freshness(mic.last_confirmed_at, new Date());
  const recurrence = describeRecurrence(mic.rrule, mic.start_time);
  const distanceKm = mic.distance_m != null ? mic.distance_m / 1000 : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${mic.title} at ${mic.venue_name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.accents}>
        {(mic.disciplines as Discipline[]).map((d) => (
          <View key={d} style={[styles.accentBar, { backgroundColor: disciplineAccents[d] }]} />
        ))}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {mic.title}
          </Text>
          <View style={styles.glyphRow}>
            {(mic.disciplines as Discipline[]).map((d) => (
              <Glyph key={d} name={disciplineGlyphs[d]} size={16} color={disciplineAccents[d]} />
            ))}
          </View>
        </View>
        <Text numberOfLines={1} style={styles.venue}>
          {mic.venue_name}
          {mic.neighborhood ? `, ${mic.neighborhood}` : ''}
          {distanceKm != null
            ? ` (${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km)`
            : ''}
        </Text>
        <Text style={styles.when}>{recurrence ?? formatNextDate(mic.next_starts_at)}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Glyph
              name={signupMethodGlyphs[mic.signup_method]}
              size={14}
              color={palette.textSecondary}
            />
            <Text style={styles.metaText}>{SIGNUP_METHOD_LABELS[mic.signup_method]}</Text>
          </View>
          <Text style={styles.metaText}>{costLabel(mic.cost_cents)}</Text>
          <View style={styles.metaItem}>
            <Glyph name="freshness-badge" size={14} color={fresh.color} />
            <Text style={[styles.metaText, { color: fresh.color }]}>{fresh.label}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cardPressed: {
    backgroundColor: palette.bgPressed,
  },
  accents: {
    width: 4,
  },
  accentBar: {
    flex: 1,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  glyphRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  title: {
    color: palette.text,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  venue: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  when: {
    color: palette.text,
    fontSize: type.caption.fontSize,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metaText: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
});
