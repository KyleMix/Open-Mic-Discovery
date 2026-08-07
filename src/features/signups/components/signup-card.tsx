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
import { spotsDetail } from '@/features/signups/capacity';
import {
  SIGNUPS_CLOSED_LABEL,
  STATUS_LABELS,
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
  useWithdraw,
} from '@/features/signups/queries';
import { roomTerms } from '@/features/signups/room-terms';
import { signupWindow } from '@/features/signups/window';
import { fonts, palette, spacing, type } from '@/theme';
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
  const spots = useNightSpots(occurrence.id);
  const join = useJoinList();
  // The sticky footer holds a second button for the same action; observing
  // its in-flight mutation keeps a fast double tap from firing two inserts.
  const joinPending =
    useMutationState({
      filters: { mutationKey: [...JOIN_LIST_MUTATION_KEY], status: 'pending' },
    }).length > 0;
  const withdraw = useWithdraw();
  const enablePerformer = useEnablePerformerRole();
  const counts = useSignupCounts(occurrence.id);
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

  const window = signupWindow(occurrence.starts_at, signupOpens, signupCloses, new Date());
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
          <Text style={styles.onDeck}>You are on deck. Get ready, you are up soon!</Text>
        ) : null}
        <Text style={styles.status}>
          {statusWithSlot(mySignup.data.status, mySignup.data.slot_position)}
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
                . Re-signing up later puts you at the end of the list.
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
  } else {
    content = (
      <>
        <Body>
          {signupMethod === 'lottery'
            ? `Enter the draw for ${nightLabel}. The host draws before the show, and you get a ` +
              'notification with the result either way. Not drawn means the waitlist.'
            : `Signups for ${nightLabel} are open.`}
        </Body>
        {counts.data && signupMethod !== 'lottery' ? (
          <Body>
            {spotsTakenLabel(counts.data.taken, counts.data.capacity) +
              (counts.data.capacity != null && counts.data.taken >= counts.data.capacity
                ? '. Signing up now joins the waitlist.'
                : '.')}
          </Body>
        ) : null}
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
          label={signupMethod === 'lottery' ? 'Put my name in the draw' : 'Sign me up'}
          busy={join.isPending || joinPending}
          onPress={() => join.mutate({ occurrenceId: occurrence.id, userId: session.user.id })}
        />
      </>
    );
  }

  // Shown in every state, including before signups open and after they close:
  // "how full is this" is the question, and the answer does not depend on
  // whether this particular person can act on it yet.
  const fullness = spots.data
    ? spotsDetail(spots.data.spots_left, spots.data.capacity, spots.data.planning_performers ?? 0)
    : null;

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
        <Text style={[styles.spots, (spots.data?.spots_left ?? 1) <= 0 && styles.spotsFull]}>
          {fullness}
        </Text>
      ) : null}
      <Text style={styles.terms}>{terms}</Text>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.success,
    borderRadius: 14,
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
