import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph, disciplineGlyphs, signupMethodGlyphs } from '@/components/glyph';
import { useSession } from '@/features/auth/session';
import { formatNextDate } from '@/features/discovery/date-label';
import { formatMilesFromMeters } from '@/features/discovery/distance';
import { freshness } from '@/features/discovery/freshness';
import type { NearbyMic } from '@/features/discovery/queries';
import { describeRecurrence } from '@/features/discovery/recurrence';
import { useFavorites, useToggleFavorite } from '@/features/favorites/queries';
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

// Re-exported for the screens that already import it from here.
export { formatNextDate };

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
  // Pattern and concrete date together: "Every Tuesday, 8:00 PM" alone hides
  // whether the next night is tomorrow or twelve days out.
  const nextDate = formatNextDate(mic.next_starts_at, mic.timezone);
  const when = recurrence ? `${recurrence} · ${nextDate}` : nextDate;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${mic.title} at ${mic.venue_name}. ${when}. ${
        SIGNUP_METHOD_LABELS[mic.signup_method]
      }. ${costLabel(mic.cost_cents)}. ${fresh.label}.`}
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
            <CardStar seriesId={mic.series_id} title={mic.title} />
          </View>
        </View>
        <Text numberOfLines={1} style={styles.venue}>
          {mic.venue_name}
          {mic.neighborhood ? `, ${mic.neighborhood}` : ''}
          {mic.distance_m != null ? ` (${formatMilesFromMeters(mic.distance_m)})` : ''}
        </Text>
        <Text style={styles.when}>{when}</Text>
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

/**
 * Favoriting straight from the card; building a favorites list used to cost
 * a detail visit and a back navigation per mic. Hidden for guests, whose
 * path to favoriting runs through the detail screen's sign-in prompt.
 */
function CardStar({ seriesId, title }: { seriesId: string; title: string }) {
  const { session } = useSession();
  // One shared favorites query serves every card; a per-card lookup would
  // fire a request per row of the list.
  const favorites = useFavorites(session?.user.id);
  const toggle = useToggleFavorite();
  if (!session) {
    return null;
  }
  const active = favorites.data?.some((f) => f.series_id === seriesId) ?? false;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        active ? `Remove ${title} from favorites` : `Add ${title} to favorites`
      }
      accessibilityState={{ selected: active }}
      disabled={toggle.isPending || favorites.isPending}
      hitSlop={12}
      onPress={() => toggle.mutate({ userId: session.user.id, seriesId, favorite: !active })}
      style={styles.star}
    >
      <Ionicons
        name={active ? 'star' : 'star-outline'}
        size={18}
        color={active ? palette.warning : palette.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  star: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
  },
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
