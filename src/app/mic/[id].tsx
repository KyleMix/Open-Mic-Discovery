import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glyph, disciplineGlyphs, signupMethodGlyphs } from '@/components/glyph';
import { OfflineBanner } from '@/components/offline-banner';
import {
  Body,
  Button,
  ErrorText,
  Field,
  KeyboardShift,
  LoadingView,
  Screen,
  Title,
} from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { addToCalendar } from '@/features/calendar/calendar';
import { SIGNUP_METHOD_LABELS, costLabel } from '@/features/discovery/components/mic-card';
import { StewardshipBadge } from '@/features/discovery/components/stewardship-badge';
import { freshness } from '@/features/discovery/freshness';
import { useFlagListing, useMicDetail } from '@/features/discovery/queries';
import { CreditCard } from '@/features/credits/components/credit-card';
import { useSeriesCredits } from '@/features/credits/queries';
import { creditFor, creditName, isOverridden, type Credit } from '@/features/credits/resolve';
import { useIsFavorite, useToggleFavorite } from '@/features/favorites/queries';
import { PlanToggle } from '@/features/plans/components/plan-toggle';
import { useSubmitClaim } from '@/features/producer/queries';
import { DiscardPrompt } from '@/components/confirm-sheet';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { ShareSheet } from '@/features/share/components/share-sheet';
import { ReportModal } from '@/features/safety/components/report-modal';
import { FLAG_REASON_LABELS } from '@/features/safety/labels';
import { SignupCard } from '@/features/signups/components/signup-card';
import { signupCta } from '@/features/signups/cta';
import { useEnablePerformerRole } from '@/features/profile/queries';
import { JOIN_LIST_MUTATION_KEY } from '@/features/signups/join-key';
import { useJoinList, useMySignup, useSignupCounts } from '@/features/signups/queries';
import { useMutationState } from '@tanstack/react-query';
import { isWalkIn } from '@/features/producer/signup-opens';
import { signupOpensClockTime, signupWindow } from '@/features/signups/window';
import { formatNextDateLong, formatRelativeDay } from '@/features/discovery/date-label';
import { describeRecurrence, formatLocalTime } from '@/features/discovery/recurrence';
import { formatInZone, zoneDiffersFromDevice } from '@/features/discovery/timezone';
import { setReturnTo } from '@/stores/return-to';
import {
  disciplineAccents,
  fonts,
  minTouchTarget,
  palette,
  spacing,
  type,
  type Discipline,
} from '@/theme';
import type { Database } from '@/types/database.types';
import { transformedImageUrl } from '@/lib/image-url';

type FlagReason = Database['public']['Enums']['flag_reason'];

const SIGNUP_METHOD_EXPLAINERS: Record<Database['public']['Enums']['signup_method'], string> = {
  first_come: 'The list fills in signup order. Sign up early, show up, you are on.',
  lottery: 'Names go into a draw. Signing up enters you; the host draws the running order.',
  reserved_slot: 'A fixed number of slots are reserved ahead of time. Grab one while they last.',
  host_booked:
    'The host books this lineup directly. Reach out through the venue or host to ask for a spot.',
};

const FLAG_REASONS: { reason: FlagReason; label: string }[] = (
  [
    'wrong_time',
    'wrong_venue',
    'wrong_cost',
    'not_happening',
    'permanently_dead',
    'duplicate',
    'other',
  ] as const
).map((reason) => ({ reason, label: FLAG_REASON_LABELS[reason] }));

export default function MicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useMicDetail(id);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          // A fallback until the listing names itself; error and not-found
          // states otherwise sit under a bare back arrow.
          title: 'Open mic',
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
          <NotFoundEscape />
        </Screen>
      ) : (
        <MicDetail
          series={detail.data.series}
          occurrences={detail.data.occurrences}
          ownerVerified={detail.data.ownerVerified}
          refreshing={detail.isRefetching}
          onRefresh={detail.refetch}
        />
      )}
    </>
  );
}

function NotFoundEscape() {
  const router = useRouter();
  return <Button label="Find another mic" onPress={() => router.replace('/(tabs)')} />;
}

type DetailData = NonNullable<ReturnType<typeof useMicDetail>['data']>;

function MicDetail({
  series,
  occurrences,
  ownerVerified,
  refreshing,
  onRefresh,
}: {
  series: DetailData['series'];
  occurrences: DetailData['occurrences'];
  ownerVerified: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const venue = series.venue;
  const fresh = freshness(series.last_confirmed_at, new Date());
  const recurrence = describeRecurrence(series.rrule, series.start_time);
  const next = occurrences.find((o) => o.status !== 'cancelled');
  // A producer can rename or reprice a single night; the next night must
  // show those overrides or performers see the wrong show and price.
  const nextTitle = next?.override_title ?? null;
  const nextCostCents = next?.override_cost_cents ?? series.cost_cents;
  const [flagOpen, setFlagOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [savePrompt, setSavePrompt] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  function openDirections() {
    if (!venue) {
      return;
    }
    const label = encodeURIComponent(venue.name);
    const url =
      Platform.OS === 'ios'
        ? `https://maps.apple.com/?daddr=${encodeURIComponent(venue.address_line + ', ' + venue.city)}`
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
        title: next.override_title ?? series.title,
        startsAt,
        endsAt,
        location: venue ? `${venue.name}, ${venue.address_line}, ${venue.city}` : series.title,
        notes: `${SIGNUP_METHOD_LABELS[series.signup_method]} · ${costLabel(nextCostCents)}. Added from Open Mic Explorer.`,
      });
    } catch {
      // The person backed out of the system sheet or the platform refused;
      // either way there is nothing useful to surface.
    }
  }

  return (
    <View style={styles.detailWrap}>
      <OfflineBanner />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.textSecondary}
          />
        }
      >
        <Stack.Screen options={{ title: series.title }} />
        {series.poster_url ? (
          <Image
            source={{ uri: transformedImageUrl(series.poster_url, { width: 1080, height: 608 })! }}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Share ${series.title}`}
              onPress={() => setShareOpen(true)}
              style={styles.iconTap}
            >
              <Ionicons name="share-outline" size={24} color={palette.textSecondary} />
            </Pressable>
            <FavoriteStar seriesId={series.id} onSignedOutPress={() => setSavePrompt(true)} />
          </View>
        </View>

        {savePrompt ? (
          <SignUpPrompt
            title="Save this mic"
            reason="Favorites live with your account, so they follow you to any device."
            perks={[
              'A nudge on the morning it happens',
              'Told the moment signups open',
              'Get on the list without leaving the app',
            ]}
          />
        ) : null}

        <MicCredits seriesId={series.id} occurrenceId={next?.id ?? null} />

        <View style={styles.freshRow}>
          <Glyph name="freshness-badge" size={16} color={fresh.color} />
          <Text style={[styles.freshText, { color: fresh.color }]}>{fresh.label}</Text>
          <Text style={[styles.freshText, { color: palette.textSecondary }]}>·</Text>
          <StewardshipBadge ownerId={series.owner_id} verified={ownerVerified} />
        </View>

        <Card>
          <Text style={styles.when}>{recurrence ?? 'Schedule varies'}</Text>
          {next ? (
            <Text style={styles.nextDate}>
              Next: {formatNextDateLong(next.starts_at, series.timezone)}
              {next.doors_at
                ? ` · Doors ${formatInZone(next.doors_at, series.timezone, { hour: 'numeric', minute: '2-digit' })}`
                : ''}
            </Text>
          ) : (
            <Text style={styles.nextDate}>
              {series.is_active
                ? 'No upcoming dates listed'
                : 'This mic is paused right now. Check back, or flag it if you think it is gone.'}
            </Text>
          )}
          {zoneDiffersFromDevice(series.timezone) ? (
            <Text style={styles.nextDate}>Times shown are local to the venue.</Text>
          ) : null}
          {nextTitle ? <Text style={styles.overrideNote}>Special night: {nextTitle}</Text> : null}
          {/* A guest is the reason to pick this night over the next one, so it
              sits with the date rather than further down the page. */}
          {next?.featured_name ? (
            <>
              <Text style={styles.featured}>Featuring {next.featured_name}</Text>
              {next.featured_note ? (
                <Text style={styles.costNote}>{next.featured_note}</Text>
              ) : null}
            </>
          ) : null}
          {next && next.override_cost_cents != null ? (
            <Text style={styles.overrideNote}>
              This night: {costLabel(next.override_cost_cents)} (usually{' '}
              {costLabel(series.cost_cents)})
            </Text>
          ) : null}
          {next ? (
            <Button label="Add to my calendar" kind="secondary" onPress={addNightToCalendar} />
          ) : null}
          {occurrences.some((o) => o.status === 'cancelled') ? (
            <Text style={styles.cancelNote}>
              {occurrences
                .filter((o) => o.status === 'cancelled')
                .map(
                  (o) =>
                    `${formatInZone(o.starts_at, series.timezone, { month: 'short', day: 'numeric' })} is cancelled${o.cancellation_note ? `: ${o.cancellation_note}` : ''}`,
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
            costCents={nextCostCents}
            timezone={series.timezone}
            setLengthMinutes={series.set_length_minutes}
            ageRestriction={venue?.age_restriction ?? null}
          />
        ) : null}

        {/* Saying you are coming is separate from signing up, and works on
            nights where there is no list to sign at all. */}
        {next ? (
          <PlanToggle
            occurrence={next}
            timezone={series.timezone}
            signupMethod={series.signup_method}
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
            {series.capacity ? <Fact label="Spots" value={`${series.capacity} total`} /> : null}
            <Fact label="Starts" value={formatLocalTime(series.start_time)} />
            {/* A walk-in list is signed at the venue, so when the sheet goes out
                is the thing a performer plans around. Only shown for walk-in:
                every other method opens days ahead, where a clock time alone
                would be meaningless. */}
            {isWalkIn(series.signup_method)
              ? (() => {
                  const opens = signupOpensClockTime(series.start_time, series.signup_opens);
                  return (
                    <Fact
                      label="List opens"
                      value={opens.dayBefore ? `${opens.time} prev day` : opens.time}
                    />
                  );
                })()
              : null}
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
              {venue.has_pa != null ? (
                <Fact label="Sound system" value={venue.has_pa ? 'Yes' : 'No'} />
              ) : null}
              {venue.has_stage != null ? (
                <Fact label="Stage" value={venue.has_stage ? 'Yes' : 'No'} />
              ) : null}
              {venue.wheelchair_accessible != null ? (
                <Fact
                  label="Wheelchair access"
                  value={venue.wheelchair_accessible ? 'Yes' : 'No'}
                />
              ) : null}
            </View>
            {venue.parking_notes ? (
              <Text style={styles.costNote}>Parking: {venue.parking_notes}</Text>
            ) : null}
            <Button label="Get directions" kind="secondary" onPress={openDirections} />
            {venue.phone ? (
              <Button
                label={`Call the venue (${venue.phone})`}
                kind="secondary"
                onPress={() => Linking.openURL(`tel:${venue.phone}`).catch(() => null)}
              />
            ) : null}
            {venue.website ? (
              <Button
                label="Venue website"
                kind="secondary"
                onPress={() => Linking.openURL(venue.website as string).catch(() => null)}
              />
            ) : null}
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

        <ShareSheet seriesId={series.id} open={shareOpen} onClose={() => setShareOpen(false)} />
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
      {next ? (
        <SignupFooter
          occurrence={next}
          timezone={series.timezone}
          signupMethod={series.signup_method}
          signupOpens={series.signup_opens}
          signupCloses={series.signup_closes}
        />
      ) : null}
    </View>
  );
}

/**
 * The one primary action, anchored in thumb reach. With a poster the
 * inline signup card sits a screen and a half down; the wedge moment
 * ("I am on the list") should not require scrolling to find.
 */
// setTimeout overflows a 32-bit int near 25 days; a window opening later
// than that will not flip during one screen visit.
const MAX_TIMER_MS = 2 ** 31 - 1;

function SignupFooter({
  occurrence,
  signupMethod,
  signupOpens,
  signupCloses,
  timezone,
}: {
  occurrence: DetailData['occurrences'][number];
  signupMethod: Database['public']['Enums']['signup_method'];
  signupOpens: string;
  signupCloses: string;
  timezone: string;
}) {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const mySignup = useMySignup(occurrence.id, session?.user.id);
  const counts = useSignupCounts(occurrence.id);
  const join = useJoinList();
  // The inline signup card holds a second button for the same action; the
  // shared mutation key lets each observe the other's in-flight insert.
  const joinPending =
    useMutationState({
      filters: { mutationKey: [...JOIN_LIST_MUTATION_KEY], status: 'pending' },
    }).length > 0;
  const enablePerformer = useEnablePerformerRole();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  // The window can open while the person is reading the screen: a tick
  // re-renders at the opening instant and says so out loud.
  const [, setTick] = useState(0);
  const window = signupWindow(occurrence.starts_at, signupOpens, signupCloses, new Date());
  const opensAtMs = window.state === 'not_yet' ? window.opensAt.getTime() : null;
  const nightLabel = formatRelativeDay(occurrence.starts_at, timezone);
  useEffect(() => {
    if (opensAtMs == null) {
      return;
    }
    const delay = opensAtMs - Date.now() + 1000;
    if (delay > MAX_TIMER_MS) {
      return;
    }
    const timer = setTimeout(
      () => {
        setTick((n) => n + 1);
        AccessibilityInfo.announceForAccessibility(`Signups are open for ${nightLabel}.`);
      },
      Math.max(delay, 0),
    );
    return () => clearTimeout(timer);
  }, [opensAtMs, nightLabel]);

  const cta = signupCta({
    signedIn: !!session,
    isPerformer: profile.data ? profile.data.is_performer : null,
    signupPending: !!session && mySignup.isPending,
    myStatus: mySignup.data?.status ?? null,
    mySlot: mySignup.data?.slot_position ?? null,
    windowState: window.state,
    signupMethod,
    occurrenceStatus: occurrence.status,
    opensLabel:
      window.state === 'not_yet' ? formatRelativeDay(window.opensAt.toISOString(), timezone) : null,
    taken: counts.data?.taken ?? null,
    capacity: counts.data?.capacity ?? null,
  });
  if (!cta) {
    return null;
  }
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {join.isError ? (
        <ErrorText>
          {join.error instanceof Error ? join.error.message : 'Could not sign you up.'}
        </ErrorText>
      ) : null}
      {cta.kind === 'status' ? (
        <View accessibilityLiveRegion="polite" style={styles.footerStatus}>
          <Text style={styles.footerStatusText}>{cta.label}</Text>
        </View>
      ) : cta.kind === 'enable-performer' ? (
        <>
          <Text style={styles.footerDetail}>{cta.detail}</Text>
          {enablePerformer.isError ? (
            <ErrorText>
              {enablePerformer.error instanceof Error
                ? enablePerformer.error.message
                : 'Could not turn on performing.'}
            </ErrorText>
          ) : null}
          <Button
            label={cta.label}
            busy={enablePerformer.isPending}
            onPress={() => {
              if (session) {
                enablePerformer.mutate(session.user.id);
              }
            }}
          />
        </>
      ) : (
        <>
          {cta.kind === 'join' && cta.detail ? (
            <Text style={styles.footerDetail}>{cta.detail}</Text>
          ) : null}
          <Button
            label={cta.label}
            busy={join.isPending || joinPending}
            onPress={() => {
              if (cta.kind === 'sign-in') {
                setReturnTo(pathname);
                router.push('/(auth)/sign-in');
              } else if (session) {
                join.mutate({ occurrenceId: occurrence.id, userId: session.user.id });
              }
            }}
          />
        </>
      )}
    </View>
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
  const pathname = usePathname();
  const claim = useSubmitClaim();
  const [evidence, setEvidence] = useState('');
  const [done, setDone] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function reallyClose() {
    setEvidence('');
    setDone(false);
    setConfirmDiscard(false);
    claim.reset();
    onClose();
  }

  function close() {
    if (!done && evidence.trim()) {
      setConfirmDiscard(true);
      return;
    }
    reallyClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.modalBackdrop}>
        <KeyboardShift>
          <View style={styles.modalSheet}>
            {confirmDiscard ? (
              <DiscardPrompt onDiscard={reallyClose} onKeep={() => setConfirmDiscard(false)} />
            ) : done ? (
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
                    setReturnTo(pathname);
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
        </KeyboardShift>
      </View>
    </Modal>
  );
}

function FavoriteStar({
  seriesId,
  onSignedOutPress,
}: {
  seriesId: string;
  onSignedOutPress: () => void;
}) {
  const { session } = useSession();
  const isFavorite = useIsFavorite(session?.user.id, seriesId);
  const toggle = useToggleFavorite();
  // Signed out the star still shows and still responds. Hiding it hid the
  // reason to make an account; tapping it now says what saving would do.
  if (!session) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save this mic"
        onPress={onSignedOutPress}
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
  const pathname = usePathname();
  const flag = useFlagListing();
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function reallyClose() {
    setReason(null);
    setDetails('');
    setDone(false);
    setConfirmDiscard(false);
    flag.reset();
    onClose();
  }

  function close() {
    if (!done && (reason !== null || details.trim())) {
      setConfirmDiscard(true);
      return;
    }
    reallyClose();
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
        <KeyboardShift>
          <View style={styles.modalSheet}>
            {confirmDiscard ? (
              <DiscardPrompt onDiscard={reallyClose} onKeep={() => setConfirmDiscard(false)} />
            ) : done ? (
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
                    setReturnTo(pathname);
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
        </KeyboardShift>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  detailWrap: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  creditStack: {
    gap: spacing.sm,
  },
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    // Room for the anchored signup footer to never cover the last card.
    paddingBottom: spacing.xxl * 2 + spacing.lg,
  },
  footer: {
    backgroundColor: palette.bg,
    borderColor: palette.border,
    borderTopWidth: 1,
    bottom: 0,
    gap: spacing.sm,
    left: 0,
    padding: spacing.md,
    position: 'absolute',
    right: 0,
  },
  footerStatus: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minTouchTarget,
  },
  footerStatusText: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
    textAlign: 'center',
  },
  footerDetail: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    textAlign: 'center',
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
  iconTap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
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
  overrideNote: {
    color: palette.warning,
    fontFamily: fonts.medium,
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
    color: palette.textFaint,
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
  featured: {
    color: disciplineAccents.music,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
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

/**
 * Who is on the next night. Resolved against that occurrence, so a one-off
 * guest host shows instead of the regular one, and says so.
 *
 * Renders nothing at all while loading or on failure: credits are an addition
 * to a listing that already stands on its own, and a spinner or an error
 * banner here would interrupt the thing someone actually came to read.
 */
function MicCredits({ seriesId, occurrenceId }: { seriesId: string; occurrenceId: string | null }) {
  const credits = useSeriesCredits(seriesId);
  // Which credit the report sheet is open for, held here rather than on the
  // page: the sheet needs the credit's own id and name, and nothing above
  // this component knows which credits resolved for this night.
  const [reporting, setReporting] = useState<Credit | null>(null);
  if (!credits.data || credits.data.length === 0) {
    return null;
  }
  const host = creditFor(credits.data, 'host', occurrenceId);
  const featured = creditFor(credits.data, 'featured', occurrenceId);
  if (!host && !featured) {
    return null;
  }
  return (
    <View style={styles.creditStack}>
      {featured ? (
        <CreditCard
          credit={featured}
          role="featured"
          overridden={isOverridden(credits.data, 'featured', occurrenceId)}
          // A view column is nullable to the type generator even when the
          // underlying primary key is not. No id means nothing to report
          // against, so the affordance is simply not offered rather than
          // being offered and doing nothing.
          onReport={featured.id ? () => setReporting(featured) : undefined}
        />
      ) : null}
      {host ? (
        <CreditCard
          credit={host}
          role="host"
          overridden={isOverridden(credits.data, 'host', occurrenceId)}
          onReport={host.id ? () => setReporting(host) : undefined}
        />
      ) : null}
      {reporting && reporting.id ? (
        <ReportModal
          visible
          onClose={() => setReporting(null)}
          targetType="credit"
          targetId={reporting.id}
          // Only offer the block when there is an account behind the credit.
          // A typed-in name is not a person the app knows how to block.
          blockableUserId={reporting.profile_id ?? undefined}
          targetLabel={creditName(reporting)}
        />
      ) : null}
    </View>
  );
}
