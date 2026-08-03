import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Glyph, disciplineGlyphs, signupMethodGlyphs } from '@/components/glyph';
import { Body, Button, ErrorText, Field, LoadingView, Screen, Title } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { addToCalendar } from '@/features/calendar/calendar';
import { SIGNUP_METHOD_LABELS, costLabel } from '@/features/discovery/components/mic-card';
import { freshness } from '@/features/discovery/freshness';
import { useFlagListing, useMicDetail } from '@/features/discovery/queries';
import { useIsFavorite, useToggleFavorite } from '@/features/favorites/queries';
import { useSubmitClaim } from '@/features/producer/queries';
import { ReportModal } from '@/features/safety/components/report-modal';
import { SignupCard } from '@/features/signups/components/signup-card';
import { describeRecurrence, formatLocalTime } from '@/features/discovery/recurrence';
import { disciplineAccents, fonts, palette, spacing, type, type Discipline } from '@/theme';
import type { Database } from '@/types/database.types';

type FlagReason = Database['public']['Enums']['flag_reason'];

const SIGNUP_METHOD_EXPLAINERS: Record<Database['public']['Enums']['signup_method'], string> = {
  first_come: 'The list fills in signup order. Sign up early, show up, you are on.',
  lottery: 'Names go into a draw. Signing up enters you; the host draws the running order.',
  reserved_slot: 'A fixed number of slots are reserved ahead of time. Grab one while they last.',
  host_booked:
    'The host books this lineup directly. Reach out through the venue or host to ask for a spot.',
};

const FLAG_REASONS: { reason: FlagReason; label: string }[] = [
  { reason: 'wrong_time', label: 'Time or day is wrong' },
  { reason: 'wrong_venue', label: 'Venue info is wrong' },
  { reason: 'wrong_cost', label: 'Cost is wrong' },
  { reason: 'not_happening', label: 'A listed night is not happening' },
  { reason: 'permanently_dead', label: 'This mic is dead' },
  { reason: 'duplicate', label: 'Duplicate listing' },
  { reason: 'other', label: 'Something else' },
];

export default function MicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useMicDetail(id);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />
      {detail.isPending ? (
        <LoadingView label="Loading listing" />
      ) : detail.isError ? (
        <Screen>
          <Title>Listing</Title>
          <ErrorText>Could not load this listing. Check your connection.</ErrorText>
          <Button label="Try again" onPress={() => detail.refetch()} />
        </Screen>
      ) : !detail.data ? (
        <Screen>
          <Title>Not found</Title>
          <Body>This listing is no longer available.</Body>
        </Screen>
      ) : (
        <MicDetail series={detail.data.series} occurrences={detail.data.occurrences} />
      )}
    </>
  );
}

type DetailData = NonNullable<ReturnType<typeof useMicDetail>['data']>;

function MicDetail({
  series,
  occurrences,
}: {
  series: DetailData['series'];
  occurrences: DetailData['occurrences'];
}) {
  const venue = series.venue;
  const fresh = freshness(series.last_confirmed_at, new Date());
  const recurrence = describeRecurrence(series.rrule, series.start_time);
  const next = occurrences.find((o) => o.status !== 'cancelled');
  const [flagOpen, setFlagOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  function openDirections() {
    if (!venue) {
      return;
    }
    const label = encodeURIComponent(venue.name);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${encodeURIComponent(venue.address_line + ', ' + venue.city)}`
        : `geo:0,0?q=${encodeURIComponent(venue.address_line + ', ' + venue.city)}(${label})`;
    Linking.openURL(url).catch(() => null);
  }

  async function addNightToCalendar() {
    if (!next) {
      return;
    }
    const startsAt = new Date(next.starts_at);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
    try {
      await addToCalendar({
        title: series.title,
        startsAt,
        endsAt,
        location: venue ? `${venue.name}, ${venue.address_line}, ${venue.city}` : series.title,
        notes: `${SIGNUP_METHOD_LABELS[series.signup_method]} · ${costLabel(series.cost_cents)}. Added from Open Mic Finder.`,
      });
    } catch {
      // The person backed out of the system sheet or the platform refused;
      // either way there is nothing useful to surface.
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {series.poster_url ? (
        <Image
          source={{ uri: series.poster_url }}
          accessibilityLabel={`${series.title} poster`}
          style={styles.poster}
          contentFit="cover"
        />
      ) : null}
      <View style={styles.titleRow}>
        <Text style={styles.title}>{series.title}</Text>
        <View style={styles.glyphRow}>
          {(series.disciplines as Discipline[]).map((d) => (
            <Glyph key={d} name={disciplineGlyphs[d]} size={20} color={disciplineAccents[d]} />
          ))}
          <FavoriteStar seriesId={series.id} />
        </View>
      </View>

      <View style={styles.freshRow}>
        <Glyph name="freshness-badge" size={16} color={fresh.color} />
        <Text style={[styles.freshText, { color: fresh.color }]}>{fresh.label}</Text>
      </View>

      <Card>
        <Text style={styles.when}>{recurrence ?? 'Schedule varies'}</Text>
        {next ? (
          <Text style={styles.nextDate}>
            Next:{' '}
            {new Date(next.starts_at).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            {next.doors_at
              ? ` · Doors ${new Date(next.doors_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
              : ''}
          </Text>
        ) : (
          <Text style={styles.nextDate}>No upcoming dates listed</Text>
        )}
        {next ? (
          <Button label="Add to my calendar" kind="secondary" onPress={addNightToCalendar} />
        ) : null}
        {occurrences.some((o) => o.status === 'cancelled') ? (
          <Text style={styles.cancelNote}>
            {occurrences
              .filter((o) => o.status === 'cancelled')
              .map(
                (o) =>
                  `${new Date(o.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} is cancelled${o.cancellation_note ? `: ${o.cancellation_note}` : ''}`,
              )
              .join('\n')}
          </Text>
        ) : null}
      </Card>

      {next ? (
        <SignupCard
          occurrence={next}
          signupMethod={series.signup_method}
          signupOpens={series.signup_opens}
          signupCloses={series.signup_closes}
          costCents={series.cost_cents}
        />
      ) : null}

      <Card>
        <View style={styles.methodRow}>
          <Glyph name={signupMethodGlyphs[series.signup_method]} size={18} color={palette.text} />
          <Text style={styles.methodTitle}>{SIGNUP_METHOD_LABELS[series.signup_method]}</Text>
        </View>
        <Body>{SIGNUP_METHOD_EXPLAINERS[series.signup_method]}</Body>
        <View style={styles.factsRow}>
          <Fact label="Cost" value={costLabel(series.cost_cents)} />
          {series.set_length_minutes ? (
            <Fact label="Set" value={`${series.set_length_minutes} min`} />
          ) : null}
          {series.capacity ? <Fact label="Spots" value={String(series.capacity)} /> : null}
          <Fact label="Starts" value={formatLocalTime(series.start_time)} />
        </View>
        {series.cost_note ? <Text style={styles.costNote}>{series.cost_note}</Text> : null}
      </Card>

      {series.description ? <Body>{series.description}</Body> : null}

      {venue ? (
        <Card>
          <Text style={styles.venueName}>{venue.name}</Text>
          <Body>
            {venue.address_line}, {venue.neighborhood ? `${venue.neighborhood}, ` : ''}
            {venue.city}, {venue.region}
          </Body>
          <View style={styles.factsRow}>
            {venue.age_restriction ? (
              <Fact
                label="Ages"
                value={
                  venue.age_restriction === 'all_ages'
                    ? 'All ages'
                    : venue.age_restriction === 'eighteen_plus'
                      ? '18+'
                      : '21+'
                }
              />
            ) : null}
            {venue.has_pa != null ? <Fact label="PA" value={venue.has_pa ? 'Yes' : 'No'} /> : null}
            {venue.has_stage != null ? (
              <Fact label="Stage" value={venue.has_stage ? 'Yes' : 'No'} />
            ) : null}
            {venue.wheelchair_accessible != null ? (
              <Fact label="Accessible" value={venue.wheelchair_accessible ? 'Yes' : 'No'} />
            ) : null}
          </View>
          {venue.parking_notes ? <Text style={styles.costNote}>{venue.parking_notes}</Text> : null}
          <Button label="Get directions" kind="secondary" onPress={openDirections} />
        </Card>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Flag this listing as wrong or dead"
        onPress={() => setFlagOpen(true)}
        style={styles.flagButton}
      >
        <Glyph name="flag-listing" size={16} color={palette.textSecondary} />
        <Text style={styles.flagText}>Something wrong with this listing?</Text>
      </Pressable>

      {series.owner_id === null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Claim this mic if you run it"
          onPress={() => setClaimOpen(true)}
          style={styles.flagButton}
        >
          <Glyph name="signup-host-booked" size={16} color={palette.textSecondary} />
          <Text style={styles.flagText}>Do you run this mic? Claim it</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report this listing for abuse"
        onPress={() => setReportOpen(true)}
        style={styles.flagButton}
      >
        <Ionicons name="flag-outline" size={16} color={palette.textSecondary} />
        <Text style={styles.flagText}>Report abusive content</Text>
      </Pressable>

      <FlagModal seriesId={series.id} visible={flagOpen} onClose={() => setFlagOpen(false)} />
      <ClaimModal seriesId={series.id} visible={claimOpen} onClose={() => setClaimOpen(false)} />
      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="series"
        targetId={series.id}
        blockableUserId={series.owner_id ?? undefined}
        targetLabel="this listing"
      />
    </ScrollView>
  );
}

function ClaimModal({
  seriesId,
  visible,
  onClose,
}: {
  seriesId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { session } = useSession();
  const router = useRouter();
  const claim = useSubmitClaim();
  const [evidence, setEvidence] = useState('');
  const [done, setDone] = useState(false);

  function close() {
    setEvidence('');
    setDone(false);
    claim.reset();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          {done ? (
            <>
              <Text style={styles.modalTitle}>Claim submitted</Text>
              <Body>
                We review claims by hand to keep listings trustworthy. Once approved, this mic
                appears in your My Mics tab with full control.
              </Body>
              <Button label="Done" onPress={close} />
            </>
          ) : !session ? (
            <>
              <Text style={styles.modalTitle}>Sign in to claim</Text>
              <Body>Claiming a mic needs an account so we can hand you the keys.</Body>
              <Button
                label="Sign in"
                onPress={() => {
                  close();
                  router.push('/(auth)/sign-in');
                }}
              />
              <Button label="Cancel" kind="secondary" onPress={close} />
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>Claim this mic</Text>
              <Body>
                Tell us how we can verify you run this night: your role, socials, or who at the
                venue can vouch for you.
              </Body>
              <Field
                label="How can we verify you?"
                value={evidence}
                onChangeText={setEvidence}
                multiline
                numberOfLines={3}
                placeholder="I host every week; the bar manager Sam can confirm."
              />
              {claim.isError ? (
                <ErrorText>
                  {claim.error instanceof Error ? claim.error.message : 'Could not submit.'}
                </ErrorText>
              ) : null}
              <Button
                label="Submit claim"
                busy={claim.isPending}
                disabled={evidence.trim().length < 10}
                onPress={() =>
                  claim.mutate(
                    { seriesId, userId: session.user.id, evidence: evidence.trim() },
                    { onSuccess: () => setDone(true) },
                  )
                }
              />
              <Button label="Cancel" kind="secondary" onPress={close} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function FavoriteStar({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const { session } = useSession();
  const isFavorite = useIsFavorite(session?.user.id, seriesId);
  const toggle = useToggleFavorite();
  if (!session) {
    // Guests get the same star; tapping it routes to sign-in.
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign in to add to favorites"
        onPress={() => router.push('/(auth)/sign-in')}
        style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="star-outline" size={24} color={palette.textSecondary} />
      </Pressable>
    );
  }
  const active = isFavorite.data ?? false;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove from favorites' : 'Add to favorites'}
      accessibilityState={{ selected: active }}
      disabled={toggle.isPending || isFavorite.isPending}
      onPress={() => toggle.mutate({ userId: session.user.id, seriesId, favorite: !active })}
      style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons
        name={active ? 'star' : 'star-outline'}
        size={24}
        color={active ? palette.warning : palette.textSecondary}
      />
    </Pressable>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function FlagModal({
  seriesId,
  visible,
  onClose,
}: {
  seriesId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { session } = useSession();
  const router = useRouter();
  const flag = useFlagListing();
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  function close() {
    setReason(null);
    setDetails('');
    setDone(false);
    flag.reset();
    onClose();
  }

  async function submit() {
    if (!session || !reason) {
      return;
    }
    flag.mutate(
      { seriesId, flaggerId: session.user.id, reason, details: details.trim() || null },
      { onSuccess: () => setDone(true) },
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          {done ? (
            <>
              <Text style={styles.modalTitle}>Thanks for keeping it fresh</Text>
              <Body>Your flag is in. Flags like this are what keep listings accurate.</Body>
              <Button label="Done" onPress={close} />
            </>
          ) : !session ? (
            <>
              <Text style={styles.modalTitle}>Sign in to flag</Text>
              <Body>Flagging a listing needs an account so we can follow up on fixes.</Body>
              <Button
                label="Sign in"
                onPress={() => {
                  close();
                  router.push('/(auth)/sign-in');
                }}
              />
              <Button label="Cancel" kind="secondary" onPress={close} />
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>What is wrong?</Text>
              {FLAG_REASONS.map((r) => (
                <Pressable
                  key={r.reason}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: reason === r.reason }}
                  onPress={() => setReason(r.reason)}
                  style={[styles.reasonRow, reason === r.reason && styles.reasonRowActive]}
                >
                  <Text style={styles.reasonText}>{r.label}</Text>
                </Pressable>
              ))}
              <Field
                label="Details (optional)"
                value={details}
                onChangeText={setDetails}
                placeholder="What should it say instead?"
              />
              {flag.isError ? (
                <ErrorText>
                  {flag.error instanceof Error ? flag.error.message : 'Could not submit.'}
                </ErrorText>
              ) : null}
              <Button
                label="Submit flag"
                busy={flag.isPending}
                disabled={!reason}
                onPress={submit}
              />
              <Button label="Cancel" kind="secondary" onPress={close} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  poster: {
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 260,
    width: '100%',
  },
  title: {
    color: palette.text,
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
  },
  glyphRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  freshRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  freshText: {
    fontSize: type.caption.fontSize,
  },
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  when: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.heading.fontSize,
  },
  nextDate: {
    color: palette.textSecondary,
    fontSize: type.body.fontSize,
  },
  cancelNote: {
    color: palette.danger,
    fontSize: type.caption.fontSize,
  },
  methodRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  methodTitle: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  factsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  fact: {
    gap: 2,
  },
  factLabel: {
    color: palette.textDisabled,
    fontSize: type.caption.fontSize,
  },
  factValue: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  costNote: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  venueName: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.heading.fontSize,
  },
  flagButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  flagText: {
    color: palette.textSecondary,
    fontSize: type.body.fontSize,
    textDecorationLine: 'underline',
  },
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  reasonRow: {
    backgroundColor: palette.bg,
    borderColor: palette.border,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  reasonRowActive: {
    borderColor: palette.text,
  },
  reasonText: {
    color: palette.text,
    fontSize: type.body.fontSize,
  },
});
