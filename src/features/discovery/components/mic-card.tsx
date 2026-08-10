import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph, disciplineGlyphs, signupMethodGlyphs } from '@/components/glyph';
import { PressableScale } from '@/components/pressable-scale';
import {
  StewardshipBadge,
  cardStewardship,
} from '@/features/discovery/components/stewardship-badge';
import { useSession } from '@/features/auth/session';
import { costLabel } from '@/features/discovery/cost';
import { formatNextDate } from '@/features/discovery/date-label';
import { formatMilesFromMeters } from '@/features/discovery/distance';
import { freshness } from '@/features/discovery/freshness';
import { transformedImageUrl } from '@/lib/image-url';
import { spotsLabel } from '@/features/signups/capacity';
import type { NearbyMic } from '@/features/discovery/queries';
import { describeRecurrence } from '@/features/discovery/recurrence';
import { ShareSheet } from '@/features/share/components/share-sheet';
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

// Re-exported for the screens that already import them from here. costLabel
// lives in its own module so the share card model can price a night without
// importing this component (which imports the share sheet: a cycle).
export { formatNextDate };
export { costLabel };

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
  /** Host credit for the next night; null when nobody is credited. */
  host_name: string | null;
  /** Spots left on the next night; null when the host set no cap. */
  spots_left: number | null;
  /** An imminent night that was called off; the card says so instead of
   * silently showing the following week. */
  cancelled_next_starts_at: string | null;
};

type Props = {
  mic: MicCardMic;
  onPress: () => void;
};

export function MicCard({ mic, onPress }: Props) {
  const { session } = useSession();
  const fresh = freshness(mic.last_confirmed_at, new Date());
  // Present only once migration 20260804000100 adds owner_id to the RPC;
  // until then the card simply shows no stewardship badge.
  const stewardship = cardStewardship(mic);
  const spots = spotsLabel(mic.spots_left);
  const recurrence = describeRecurrence(mic.rrule, mic.start_time);
  // Pattern and concrete date together: "Every Tuesday, 8:00 PM" alone hides
  // whether the next night is tomorrow or twelve days out.
  const nextDate = formatNextDate(mic.next_starts_at, mic.timezone);
  const when = recurrence ? `${recurrence} · ${nextDate}` : nextDate;
  const cancelledNight = mic.cancelled_next_starts_at
    ? `${formatNextDate(mic.cancelled_next_starts_at, mic.timezone)} is cancelled`
    : null;

  // The favorite star is a sibling overlay, not a child: a button nested in
  // a button is invalid HTML, and react-native-web renders both as <button>.
  return (
    <View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${mic.title} at ${mic.venue_name}. ${when}. ${
          cancelledNight ? `${cancelledNight}. ` : ''
        }${
          mic.featured_name ? `Featuring ${mic.featured_name}. ` : ''
        }${mic.host_name ? `Hosted by ${mic.host_name}. ` : ''}${
          SIGNUP_METHOD_LABELS[mic.signup_method]
        }. ${costLabel(mic.cost_cents)}. ${fresh.label}.`}
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
            source={{ uri: transformedImageUrl(mic.poster_url, { width: 640, height: 360 })! }}
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
              {/* Room for the star and share overlays, which are siblings
                rather than children so buttons never nest. */}
              <View style={session ? styles.overlaySpacerWide : styles.overlaySpacer} />
            </View>
          </View>
          <Text numberOfLines={1} style={styles.venue}>
            {mic.venue_name}
            {mic.neighborhood ? `, ${mic.neighborhood}` : ''}
            {mic.distance_m != null ? ` (${formatMilesFromMeters(mic.distance_m)})` : ''}
          </Text>
          <Text style={styles.when}>{when}</Text>
          {cancelledNight ? <Text style={styles.cancelledNight}>{cancelledNight}</Text> : null}
          {/* A guest is the reason someone picks one night over another, so it
            belongs on the card rather than only on the mic page. */}
          {mic.featured_name ? (
            <Text numberOfLines={1} style={styles.featured}>
              Featuring {mic.featured_name}
            </Text>
          ) : null}
          {mic.host_name ? (
            <Text numberOfLines={1} style={styles.host}>
              Hosted by {mic.host_name}
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
            {stewardship ? <StewardshipBadge ownerId={stewardship.ownerId} variant="card" /> : null}
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
      <CardStar seriesId={mic.series_id} title={mic.title} />
      <CardShare seriesId={mic.series_id} title={mic.title} />
    </View>
  );
}

/**
 * Sharing straight from the card: word of mouth is the growth loop, and a
 * detail-screen detour is one screen too many for "send this to a friend".
 * Same sibling-overlay rule as the star, so buttons never nest.
 */
function CardShare({ seriesId, title }: { seriesId: string; title: string }) {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Share ${title}`}
        hitSlop={12}
        onPress={() => setOpen(true)}
        style={[styles.share, session ? styles.shareBesideStar : null]}
      >
        <Ionicons name="share-outline" size={18} color={palette.textSecondary} />
      </Pressable>
      <ShareSheet seriesId={seriesId} open={open} onClose={() => setOpen(false)} />
    </>
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
      accessibilityLabel={active ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
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
  // Overlaid on the card's top-right corner, where the title row reserves
  // room with the overlay spacers, so the tap targets never nest.
  star: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    zIndex: 1,
  },
  share: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    zIndex: 1,
  },
  // Signed in, the star holds the corner and share sits inside it.
  shareBesideStar: {
    right: spacing.md + 32,
  },
  overlaySpacer: {
    width: 24,
  },
  overlaySpacerWide: {
    width: 56,
  },
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
  cancelledNight: {
    color: palette.danger,
    fontFamily: fonts.medium,
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
  host: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    // The badge is a fourth item; at 375pt the row wraps rather than
    // shrinking anything.
    flexWrap: 'wrap',
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
