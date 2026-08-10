import { useMutationState } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText } from '@/components/ui';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useOwnProfile } from '@/features/auth/queries';
import { eventDate, eventDateShort, eventTime } from '@/features/discovery/local-time';
import { useSession } from '@/features/auth/session';
import { formatRelativeDay } from '@/features/discovery/date-label';
import { useEnablePerformerRole } from '@/features/profile/queries';
import { costLabel } from '@/features/discovery/components/mic-card';
import { drawEntrantsLabel, drawnSpotsLabel, spotsDetail } from '@/features/signups/capacity';
import {
  CTA_LABELS,
  DRAW_DONE_LABEL,
  SIGNUPS_CLOSED_LABEL,
  STATUS_LABELS,
  ordinal,
  slotLabel,
  spotsTakenLabel,
  statusWithSlot,
} from '@/features/signups/labels';
import { JOIN_LIST_MUTATION_KEY } from '@/features/signups/join-key';
import {
  useJoinList,
  useMySignup,
  useNightSpots,
  useSignupCounts,
  useWaitlistRank,
  useWithdraw,
} from '@/features/signups/queries';
import { PushPrimer } from '@/features/notifications/components/push-primer';
import { roomTerms } from '@/features/signups/room-terms';
import { signupWindow } from '@/features/signups/window';
import { fonts, maxFontScale, palette, radius, spacing, type } from '@/theme';
import type { Database } from '@/types/database.types';

type Occurrence = Database['public']['Tables']['mic_occurrences']['Row'];

/** What happens next, for the statuses where that is not obvious. */
const STATUS_HINTS: Partial<Record<Database['public']['Enums']['signup_status'], string>> = {
  requested: 'The host runs the draw before the show. You get a notification with the result.',
  waitlisted:
    'If a spot opens, the host promotes people from the waitlist and you get a notification.',
  no_show: 'Think this is a mistake? Talk to the host at the venue.',
};

type Props = {
  occurrence: Occurrence;
  /** Opens the share sheet. The person who just got on the list is the
   * person most likely to bring a crowd, so the card offers it there. */
  onShare?: () => void;
  /** The mic's IANA timezone; night labels render in venue-local time. */
  timezone: string | null;
  signupMethod: Database['public']['Enums']['signup_method'];
  signupOpens: string;
  signupCloses: string;
  costCents?: number;
  setLengthMinutes?: number | null;
  ageRestriction?: Database['public']['Enums']['age_restriction'] | null;
};

/** The "I am on the list" moment: signup state and actions for a night. */
export function SignupCard({
  occurrence,
  onShare,
  timezone,
  signupMethod,
  signupOpens,
  signupCloses,
  costCents = 0,
  setLengthMinutes = null,
  ageRestriction = null,
}: Props) {
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const mySignup = useMySignup(occurrence.id, session?.user.id);
  // Other performers' signups never reach this subscriber over realtime
  // (RLS filters their rows), so while the window is open the fullness
  // numbers poll: two people watching "1 spot left" is exactly when the
  // number must move.
  const window = signupWindow(occurrence.starts_at, signupOpens, signupCloses, new Date());
  const pollFullness = occurrence.status === 'scheduled' && window.state === 'open';
  const spots = useNightSpots(occurrence.id, { poll: pollFullness });
  const join = useJoinList();
  // The sticky footer holds a second button for the same action; observing
  // its in-flight mutation keeps a fast double tap from firing two inserts.
  const joinPending =
    useMutationState({
      filters: { mutationKey: [...JOIN_LIST_MUTATION_KEY], status: 'pending' },
    }).length > 0;
  const withdraw = useWithdraw();
  const enablePerformer = useEnablePerformerRole();
  const counts = useSignupCounts(occurrence.id, { poll: pollFullness });
  // "Waitlisted" alone answers nothing; the place in line is the fact a
  // waiting performer keeps checking for. Realtime keeps it moving.
  const waitlistRank = useWaitlistRank(
    occurrence.id,
    session?.user.id,
    mySignup.data?.status === 'waitlisted',
  );
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  // Draw results, promotion, and on-deck arrive via realtime while the
  // performer is staring at this card; a sighted user sees the card
  // change, a screen reader user hears it announced.
  const signupStatus = mySignup.isSuccess ? (mySignup.data?.status ?? null) : undefined;
  const onDeck = mySignup.isSuccess ? mySignup.data?.on_deck_at != null : undefined;
  const lastAnnounced = useRef<{ status: string | null; onDeck: boolean } | null>(null);
  useEffect(() => {
    if (signupStatus === undefined || onDeck === undefined) {
      return;
    }
    const last = lastAnnounced.current;
    lastAnnounced.current = { status: signupStatus, onDeck };
    if (!last) {
      return;
    }
    if (onDeck && !last.onDeck) {
      AccessibilityInfo.announceForAccessibility('You are on deck. Get ready, you are up soon.');
    } else if (signupStatus && signupStatus !== last.status) {
      AccessibilityInfo.announceForAccessibility(STATUS_LABELS[signupStatus]);
    }
  }, [signupStatus, onDeck]);

  if (signupMethod === 'host_booked' || occurrence.status !== 'scheduled') {
    return null;
  }

  const nightLabel = formatRelativeDay(occurrence.starts_at, timezone);

  let content: React.ReactNode;
  if (!session) {
    content = (
      <SignUpPrompt
        title={`Get on the list for ${nightLabel}`}
        reason="Your spot on a signup list needs a name attached to it, so this one does need an account."
        perks={[
          'Your slot number, live, as the list fills',
          'A heads up when you are on deck',
          'Save this mic and get reminded the day of',
        ]}
      />
    );
  } else if (profile.data && !profile.data.is_performer) {
    content = (
      <>
        <Body>
          Signing up needs the performer role. One tap turns it on; it sits alongside any other role
          you have.
        </Body>
        {enablePerformer.isError ? (
          <ErrorText>
            {enablePerformer.error instanceof Error
              ? enablePerformer.error.message
              : 'Could not turn on performing.'}
          </ErrorText>
        ) : null}
        <Button
          label="Turn on performing"
          busy={enablePerformer.isPending}
          onPress={() => enablePerformer.mutate(session.user.id)}
        />
      </>
    );
  } else if (mySignup.isPending) {
    content = <Body>Checking your signup...</Body>;
  } else if (mySignup.data) {
    content = (
      <>
        {mySignup.data.on_deck_at ? (
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.onDeck}>
            You are on deck. Get ready, you are up soon!
          </Text>
        ) : null}
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.status}>
          {statusWithSlot(mySignup.data.status, mySignup.data.slot_position)}
          {mySignup.data.status === 'waitlisted' && waitlistRank.data != null
            ? ` · ${ordinal(waitlistRank.data)} in line`
            : ''}
        </Text>
        {STATUS_HINTS[mySignup.data.status] ? (
          <Body>{STATUS_HINTS[mySignup.data.status]}</Body>
        ) : null}
        {withdraw.isError ? (
          <ErrorText>
            {withdraw.error instanceof Error ? withdraw.error.message : 'Could not withdraw.'}
          </ErrorText>
        ) : null}
        {['requested', 'confirmed', 'waitlisted', 'drawn'].includes(mySignup.data.status) ? (
          confirmingWithdraw ? (
            <>
              <Body>
                Withdrawing gives up your spot
                {mySignup.data.slot_position != null
                  ? ` (${slotLabel(mySignup.data.slot_position)})`
                  : ''}
                .{' '}
                {signupMethod === 'lottery'
                  ? ['drawn', 'waitlisted'].includes(mySignup.data.status)
                    ? 'The draw has run, so there is no way back in for this night.'
                    : 'You can put your name back in until the host runs the draw.'
                  : 'Re-signing up later puts you at the end of the list.'}
              </Body>
              <Button
                label="Yes, withdraw"
                busy={withdraw.isPending}
                onPress={() =>
                  withdraw.mutate(
                    { occurrenceId: occurrence.id, userId: session.user.id },
                    { onSettled: () => setConfirmingWithdraw(false) },
                  )
                }
              />
              <Button
                label="Keep my spot"
                kind="secondary"
                onPress={() => setConfirmingWithdraw(false)}
              />
            </>
          ) : (
            <Button label="Withdraw" kind="secondary" onPress={() => setConfirmingWithdraw(true)} />
          )
        ) : null}
        <PushPrimer
          userId={session.user.id}
          message="Want a push when your status changes or you are on deck?"
        />
        {onShare &&
        ['requested', 'confirmed', 'waitlisted', 'drawn'].includes(mySignup.data.status) ? (
          <>
            <Body>A crowd makes the night. The flyer takes one tap to send.</Body>
            <Button label="Share this mic" kind="secondary" onPress={onShare} />
          </>
        ) : null}
      </>
    );
  } else if (window.state === 'not_yet') {
    // The time matters as much as the date, and for a walk-in list it is the
    // whole answer: a list opening an hour before a 7 PM show read as "open
    // Monday, Aug 10", which is the same day as the mic and says nothing.
    const opensIso = window.opensAt.toISOString();
    const opensOnEventDay =
      eventDateShort(opensIso, timezone) === eventDateShort(occurrence.starts_at, timezone);
    content = (
      <Body>
        Signups for {nightLabel} open{' '}
        {opensOnEventDay
          ? `at ${eventTime(opensIso, timezone)}`
          : `${eventDate(opensIso, timezone, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })} at ${eventTime(opensIso, timezone)}`}
        .
      </Body>
    );
  } else if (window.state === 'closed') {
    content = <Body>{SIGNUPS_CLOSED_LABEL}</Body>;
  } else if (signupMethod === 'lottery' && counts.data?.draw_done) {
    content = <Body>{DRAW_DONE_LABEL}</Body>;
  } else {
    content = (
      <>
        <Body>
          {signupMethod === 'lottery'
            ? `Enter the draw for ${nightLabel}. The host draws before the show, and you get a ` +
              'notification with the result either way. Not drawn means the waitlist.'
            : `Signups for ${nightLabel} are open.`}
        </Body>
        {join.isError ? (
          <ErrorText>
            {join.error instanceof Error ? join.error.message : 'Could not sign up.'}
          </ErrorText>
        ) : null}
        {signupMethod === 'reserved_slot' && costCents > 0 ? (
          <Body>
            Slots at this mic cost ${(costCents / 100).toFixed(costCents % 100 === 0 ? 0 : 2)}, paid
            at the venue or to the host directly, never inside this app.
          </Body>
        ) : null}
        <Button
          label={signupMethod === 'lottery' ? CTA_LABELS.lottery : CTA_LABELS.join}
          busy={join.isPending || joinPending}
          onPress={() => join.mutate({ occurrenceId: occurrence.id, userId: session.user.id })}
        />
      </>
    );
  }

  // Shown in every state, including before signups open and after they close:
  // "how full is this" is the question, and the answer does not depend on
  // whether this particular person can act on it yet. A lottery answers it
  // differently: before the draw nobody holds a spot ("12 of 12 spots
  // left" on a 40-entrant night was misinformation), and after it the list
  // is set rather than open to a waitlist.
  const fullness =
    signupMethod === 'lottery'
      ? counts.data?.draw_done
        ? drawnSpotsLabel(spots.data?.spots_left, spots.data?.capacity)
        : counts.data
          ? drawEntrantsLabel(counts.data.entrants, counts.data.capacity)
          : null
      : ((spots.data
          ? spotsDetail(
              spots.data.spots_left,
              spots.data.capacity,
              spots.data.planning_performers ?? 0,
            )
          : null) ??
        // Uncapped nights have no spots-left arithmetic; the count of
        // names so far is still worth the line. This header is now the
        // card's only fullness reading: it used to be restated inside the
        // open-signups copy as "1 of 20 spots taken", the same fact in the
        // opposite direction.
        (counts.data && counts.data.taken > 0
          ? `${spotsTakenLabel(counts.data.taken, counts.data.capacity)}.`
          : null));

  // The terms of the room sit beside the commit button in every state:
  // nobody should have to scroll two cards down to learn the list closes
  // early, the sets are four minutes, or the bar is 21 and up.
  const terms = roomTerms({
    startsAt: occurrence.starts_at,
    signupCloses,
    timezone,
    setLengthMinutes,
    cost: costLabel(costCents),
    ageRestriction,
  });

  return (
    <View style={styles.card}>
      {fullness ? (
        <Text
          maxFontSizeMultiplier={maxFontScale}
          style={[styles.spots, (spots.data?.spots_left ?? 1) <= 0 && styles.spotsFull]}
        >
          {fullness}
        </Text>
      ) : null}
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.terms}>
        {terms}
      </Text>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.success,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  status: {
    color: palette.success,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  spots: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  terms: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  spotsFull: {
    color: palette.danger,
    fontFamily: fonts.medium,
  },
  onDeck: {
    color: palette.warning,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
});
