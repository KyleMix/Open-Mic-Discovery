import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph, disciplineGlyphs, signupMethodGlyphs } from '@/components/glyph';
import { formatMilesFromMeters } from '@/features/discovery/distance';
import { freshness } from '@/features/discovery/freshness';
import type { NearbyMic } from '@/features/discovery/queries';
import { describeRecurrence } from '@/features/discovery/recurrence';
import { disciplineAccents, fonts, palette, spacing, type, type Discipline } from '@/theme';

// Plain-language names for how you get on stage; shared across discovery,
// mic detail, and producer screens so the wording never drifts.
export const SIGNUP_METHOD_LABELS: Record<NearbyMic['signup_method'], string> = {
  lottery: 'Name draw',
  first_come: 'Walk-in list',
  reserved_slot: 'Book ahead',
  host_booked: 'Invite only',
};

export const SIGNUP_METHOD_DESCRIPTIONS: Record<NearbyMic['signup_method'], string> = {
  first_come: 'Add your name when you get there.',
  lottery: 'Names get drawn at random.',
  reserved_slot: 'Reserve your spot before the night.',
  host_booked: 'The host chooses the lineup.',
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
          {mic.distance_m != null ? ` (${formatMilesFromMeters(mic.distance_m)})` : ''}
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
