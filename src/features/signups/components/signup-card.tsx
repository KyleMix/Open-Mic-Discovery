import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText } from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { eventDate, eventDateShort, eventTime } from '@/features/discovery/local-time';
import { useSession } from '@/features/auth/session';
import { useEnablePerformerRole } from '@/features/profile/queries';
import { STATUS_LABELS } from '@/features/signups/labels';
import { useJoinList, useMySignup, useWithdraw } from '@/features/signups/queries';
import { signupWindow } from '@/features/signups/window';
import { fonts, palette, spacing, type } from '@/theme';
import type { Database } from '@/types/database.types';

type Occurrence = Database['public']['Tables']['mic_occurrences']['Row'];

type Props = {
  occurrence: Occurrence;
  /** The mic's IANA timezone; night labels render in venue-local time. */
  timezone: string | null;
  signupMethod: Database['public']['Enums']['signup_method'];
  signupOpens: string;
  signupCloses: string;
  costCents?: number;
};

/** The "I am on the list" moment: signup state and actions for a night. */
export function SignupCard({
  occurrence,
  timezone,
  signupMethod,
  signupOpens,
  signupCloses,
  costCents = 0,
}: Props) {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const mySignup = useMySignup(occurrence.id, session?.user.id);
  const join = useJoinList();
  const withdraw = useWithdraw();
  const enablePerformer = useEnablePerformerRole();

  if (signupMethod === 'host_booked' || occurrence.status !== 'scheduled') {
    return null;
  }

  const window = signupWindow(occurrence.starts_at, signupOpens, signupCloses, new Date());
  const nightLabel = eventDate(occurrence.starts_at, timezone, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

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
          {STATUS_LABELS[mySignup.data.status]}
          {mySignup.data.slot_position != null ? ` · Slot ${mySignup.data.slot_position}` : ''}
        </Text>
        {['requested', 'confirmed', 'waitlisted', 'drawn'].includes(mySignup.data.status) ? (
          <Button
            label="Withdraw"
            kind="secondary"
            busy={withdraw.isPending}
            onPress={() =>
              withdraw.mutate({ occurrenceId: occurrence.id, userId: session.user.id })
            }
          />
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
