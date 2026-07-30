import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Glyph, disciplineGlyphs, signupMethodGlyphs } from '@/components/glyph';
import { PressableScale } from '@/components/pressable-scale';
import { formatMilesFromMeters } from '@/features/discovery/distance';
import { eventDateShort } from '@/features/discovery/local-time';
import { freshness } from '@/features/discovery/freshness';
import { spotsLabel } from '@/features/signups/capacity';
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

export function formatNextDate(startsAt: string | null, timezone?: string | null): string {
  if (!startsAt) {
    return 'No upcoming date';
  }
  return eventDateShort(startsAt, timezone);
}

export function costLabel(costCents: number): string {
  return costCents === 0 ? 'Free' : `$${(costCents / 100).toFixed(costCents % 100 === 0 ? 0 : 2)}`;
}

/**
 * What the card actually draws, rather than a whole nearby row. Search returns
 * a slightly different shape, and both satisfy this, so a searched mic and a
 * nearby mic render as the same card instead of two different formats.
 */
export type MicCardMic = {
  series_id: string;
  title: string;
  disciplines: NearbyMic['disciplines'];
  signup_method: NearbyMic['signup_method'];
  cost_cents: number;
  rrule: string;
  start_time: string;
  timezone: string | null;
  last_confirmed_at: string | null;
  venue_name: string;
  neighborhood: string | null;
  distance_m: number | null;
  next_starts_at: string | null;
  poster_url: string | null;
  /** Guest on the next night, if the producer named one. */
  featured_name: string | null;
  /** Spots left on the next night; null when the host set no cap. */
  spots_left: number | null;
};

type Props = {
  mic: MicCardMic;
  onPress: () => void;
};

export function MicCard({ mic, onPress }: Props) {
  const fresh = freshness(mic.last_confirmed_at, new Date());
  const spots = spotsLabel(mic.spots_left);
  const recurrence = describeRecurrence(mic.rrule, mic.start_time);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${mic.title} at ${mic.venue_name}`}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.accents}>
        {(mic.disciplines as Discipline[]).map((d) => (
          <View key={d} style={[styles.accentBar, { backgroundColor: disciplineAccents[d] }]} />
        ))}
      </View>
      {mic.poster_url ? (
        <Image
          source={{ uri: mic.poster_url }}
          accessibilityLabel={`${mic.title} poster`}
          style={styles.poster}
          contentFit="cover"
          transition={150}
        />
      ) : null}
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
        <Text style={styles.when}>
          {recurrence ?? formatNextDate(mic.next_starts_at, mic.timezone)}
        </Text>
        {/* A guest is the reason someone picks one night over another, so it
            belongs on the card rather than only on the mic page. */}
        {mic.featured_name ? (
          <Text numberOfLines={1} style={styles.featured}>
            Featuring {mic.featured_name}
          </Text>
        ) : null}
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
          {/* Full is the one state worth interrupting the row for: it changes
              whether signing up gets you a slot or a place in the queue. */}
          {spots ? (
            <Text style={[styles.metaText, spots.tone !== 'plain' && styles.spotsAlert]}>
              {spots.label}
            </Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
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
  accents: {
    width: 4,
  },
  accentBar: {
    flex: 1,
  },
  poster: {
    alignSelf: 'stretch',
    backgroundColor: palette.bgPressed,
    width: 72,
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
  spotsAlert: {
    color: palette.danger,
    fontFamily: fonts.medium,
  },
  featured: {
    color: disciplineAccents.music,
    fontFamily: fonts.medium,
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
