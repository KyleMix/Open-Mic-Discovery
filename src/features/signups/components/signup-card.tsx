import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText } from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { formatRelativeDay } from '@/features/discovery/date-label';
import { useEnablePerformerRole } from '@/features/producer/queries';
import { useJoinList, useMySignup, useSignupCounts, useWithdraw } from '@/features/signups/queries';
import { signupWindow } from '@/features/signups/window';
import { fonts, palette, spacing, type } from '@/theme';
import type { Database } from '@/types/database.types';

type Occurrence = Database['public']['Tables']['mic_occurrences']['Row'];

export const STATUS_LABELS: Record<Database['public']['Enums']['signup_status'], string> = {
  requested: 'In the draw',
  confirmed: 'On the list',
  waitlisted: 'Waitlisted',
  drawn: 'You are in: drawn for a spot',
  performed: 'Performed',
  no_show: 'Marked no-show',
};

/** What happens next, for the statuses where that is not obvious. */
const STATUS_HINTS: Partial<Record<Database['public']['Enums']['signup_status'], string>> = {
  requested: 'The host runs the draw before the show. You get a notification with the result.',
  waitlisted:
    'If a spot opens, the host promotes people from the waitlist and you get a notification.',
  no_show: 'Think this is a mistake? Talk to the host at the venue.',
};

type Props = {
  occurrence: Occurrence;
  signupMethod: Database['public']['Enums']['signup_method'];
  signupOpens: string;
  signupCloses: string;
  costCents?: number;
  /** Series IANA timezone so the night label is venue-local, not device-local. */
  timezone?: string;
};

/** The "I am on the list" moment: signup state and actions for a night. */
export function SignupCard({
  occurrence,
  signupMethod,
  signupOpens,
  signupCloses,
  costCents = 0,
  timezone,
}: Props) {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const mySignup = useMySignup(occurrence.id, session?.user.id);
  const join = useJoinList();
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
      <>
        <Body>Sign in to get on the list for {nightLabel}.</Body>
        <Button label="Sign in" onPress={() => router.push('/(auth)/sign-in')} />
      </>
    );
  } else if (profile.data && !profile.data.is_performer) {
    content = (
      <>
        <Body>Signing up for slots needs the performer role on your account.</Body>
        {enablePerformer.isError ? (
          <ErrorText>
            {enablePerformer.error instanceof Error
              ? enablePerformer.error.message
              : 'Could not turn on performing.'}
          </ErrorText>
        ) : null}
        <Button
          label="I perform: turn it on"
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
          {STATUS_LABELS[mySignup.data.status]}
          {mySignup.data.slot_position != null
            ? ` · Slot ${mySignup.data.slot_position} in the running order`
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
                  ? ` (Slot ${mySignup.data.slot_position})`
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
    content = (
      <Body>
        Signups for {nightLabel} open {formatRelativeDay(window.opensAt.toISOString(), timezone)}.
      </Body>
    );
  } else if (window.state === 'closed') {
    content = (
      <Body>Signups for {nightLabel} are closed. Walk-ups may still be possible at the venue.</Body>
    );
  } else {
    content = (
      <>
        <Body>
          {signupMethod === 'lottery'
            ? `Enter the draw for ${nightLabel}. The host draws the order.`
            : `Signups for ${nightLabel} are open.`}
        </Body>
        {counts.data && signupMethod !== 'lottery' ? (
          <Body>
            {counts.data.capacity != null
              ? `${counts.data.taken} of ${counts.data.capacity} spots taken${
                  counts.data.taken >= counts.data.capacity
                    ? '. Signing up now joins the waitlist.'
                    : '.'
                }`
              : `${counts.data.taken} signed up so far.`}
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
          busy={join.isPending}
          onPress={() => join.mutate({ occurrenceId: occurrence.id, userId: session.user.id })}
        />
      </>
    );
  }

  return <View style={styles.card}>{content}</View>;
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
  onDeck: {
    color: palette.warning,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
});
