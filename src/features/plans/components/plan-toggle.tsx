import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText } from '@/components/ui';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useSession } from '@/features/auth/session';
import { eventDate } from '@/features/discovery/local-time';
import { useMyPlan, useTogglePlan } from '@/features/plans/queries';
import { isWalkIn } from '@/features/producer/signup-opens';
import { fonts, palette, spacing, type } from '@/theme';
import type { Database } from '@/types/database.types';

type Occurrence = Database['public']['Tables']['mic_occurrences']['Row'];

type Props = {
  occurrence: Occurrence;
  timezone: string | null;
  signupMethod: Database['public']['Enums']['signup_method'];
};

/**
 * "I am coming to this."
 *
 * Separate from signing up on purpose. A walk-in list is signed at the venue,
 * so on those nights nothing in this app told the host whether four people
 * were coming or forty. This is the one tap that answers that, and it is open
 * to people coming to watch as well, because a room is a room.
 *
 * The copy says the host sees it. That has to be visible at the moment of the
 * tap, not buried in a policy page.
 */
export function PlanToggle({ occurrence, timezone, signupMethod }: Props) {
  const { session } = useSession();
  const plan = useMyPlan(occurrence.id, session?.user.id);
  const toggle = useTogglePlan();
  const [prompt, setPrompt] = useState(false);

  if (occurrence.status !== 'scheduled') {
    return null;
  }

  const nightLabel = eventDate(occurrence.starts_at, timezone, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const going = plan.data ?? false;

  if (!session) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Going to this one?</Text>
        <Body>
          {isWalkIn(signupMethod)
            ? 'The list gets signed at the venue, so telling the host you are coming is the only way they know how many to plan for.'
            : 'Tell the host you are coming, even if you are not performing.'}
        </Body>
        <Button label="I am going" onPress={() => setPrompt(true)} />
        {prompt ? (
          <SignUpPrompt
            title="Tell the host you are coming"
            reason="Your name has to be attached to a headcount for it to be worth anything to the host."
            perks={[
              'Every night you said yes to, in one tab',
              'The host knows to expect you',
              'Get on the list without leaving the app',
            ]}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {going ? `You are going on ${nightLabel}` : 'Going to this one?'}
      </Text>
      <Body>
        {going
          ? 'The host has you in their headcount for the night, under your stage name.'
          : 'Tell the host you are coming. They see your stage name in their headcount, nothing else.'}
      </Body>
      {toggle.isError ? (
        <ErrorText>
          {toggle.error instanceof Error ? toggle.error.message : 'Could not save that.'}
        </ErrorText>
      ) : null}
      <Button
        label={going ? 'I can no longer make it' : 'I am going'}
        kind={going ? 'secondary' : 'primary'}
        busy={toggle.isPending || plan.isPending}
        onPress={() =>
          toggle.mutate({
            occurrenceId: occurrence.id,
            userId: session.user.id,
            going: !going,
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  title: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
});
