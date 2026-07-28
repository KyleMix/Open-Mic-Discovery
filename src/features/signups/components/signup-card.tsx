import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText } from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { useJoinList, useMySignup, useWithdraw } from '@/features/signups/queries';
import { signupWindow } from '@/features/signups/window';
import { fonts, palette, spacing, type } from '@/theme';
import type { Database } from '@/types/database.types';

type Occurrence = Database['public']['Tables']['mic_occurrences']['Row'];

const STATUS_LABELS: Record<Database['public']['Enums']['signup_status'], string> = {
  requested: 'In the draw',
  confirmed: 'On the list',
  waitlisted: 'Waitlisted',
  drawn: 'Drawn: on the list',
  performed: 'Performed',
  no_show: 'Marked no-show',
};

type Props = {
  occurrence: Occurrence;
  signupMethod: Database['public']['Enums']['signup_method'];
  signupOpens: string;
  signupCloses: string;
  costCents?: number;
};

/** The "I am on the list" moment: signup state and actions for a night. */
export function SignupCard({
  occurrence,
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

  if (signupMethod === 'host_booked' || occurrence.status !== 'scheduled') {
    return null;
  }

  const window = signupWindow(occurrence.starts_at, signupOpens, signupCloses, new Date());
  const nightLabel = new Date(occurrence.starts_at).toLocaleDateString(undefined, {
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
    content = <Body>Enable the performer role on your profile to sign up for slots.</Body>;
  } else if (mySignup.isPending) {
    content = <Body>Checking your signup...</Body>;
  } else if (mySignup.data) {
    content = (
      <>
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
    content = (
      <Body>
        Signups for {nightLabel} open{' '}
        {window.opensAt.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}
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
});
