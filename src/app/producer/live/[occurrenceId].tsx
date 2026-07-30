import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { eventDate, eventTime } from '@/features/discovery/local-time';
import { liveOrder, performerName, type LiveRow } from '@/features/live/order';
import { formatClock, overBy, timerTone } from '@/features/live/timer';
import { liveWindow } from '@/features/live/window';
import { useNightContext } from '@/features/producer/queries';
import { useMarkOnDeck, useRoster, useSetSignupStatus } from '@/features/signups/queries';
import { fonts, palette, spacing, type } from '@/theme';

/**
 * Running the night.
 *
 * The host is standing at the back of a room with a performer on stage, so
 * this screen is two numbers and one big button. The timer is silent: it
 * changes colour and taps the phone once, and never makes a sound, because a
 * chime at the end of a set lands in the middle of someone's punchline.
 *
 * Where the night is up to lives in the database, not here. Marking someone
 * done is what moves the night on, so a dead phone or a handover mid-show
 * costs nothing.
 */
export default function LiveScreen() {
  const { occurrenceId } = useLocalSearchParams<{ occurrenceId: string }>();
  const night = useNightContext(occurrenceId);
  const roster = useRoster(occurrenceId);
  const setStatus = useSetSignupStatus();
  const onDeck = useMarkOnDeck();

  // A host does not want to unlock their phone between every set.
  useKeepAwake();

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Time already banked before the current pause. The clock is read from the
  // system inside the effect rather than counted in ticks, so a set timed
  // across a backgrounded app comes back with the right number on it.
  const bankedRef = useRef(0);
  const buzzedRef = useRef(false);

  useEffect(() => {
    if (!running) {
      return;
    }
    const startedAt = Date.now() - bankedRef.current;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => {
      bankedRef.current = Date.now() - startedAt;
      clearInterval(id);
    };
  }, [running]);

  const setLength = night.data?.series?.set_length_minutes ?? null;

  // One tap in the hand at the agreed length. Silent, and once only.
  useEffect(() => {
    if (!setLength || buzzedRef.current || !running) {
      return;
    }
    if (elapsed >= setLength * 60 * 1000) {
      buzzedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
    }
  }, [elapsed, setLength, running]);

  if (night.isPending || roster.isPending) {
    return <LoadingView label="Loading the night" />;
  }
  if (night.isError || roster.isError || !night.data) {
    return (
      <Screen>
        <Title>Live</Title>
        <ErrorText>Could not load this night.</ErrorText>
        <Button
          label="Try again"
          onPress={() => {
            night.refetch();
            roster.refetch();
          }}
        />
      </Screen>
    );
  }

  const timezone = night.data.series?.timezone ?? null;
  const window = liveWindow(night.data.starts_at, new Date());
  if (window.state === 'too_early') {
    return (
      <Screen>
        <Title>Not yet</Title>
        <Body>
          Live opens an hour before the night starts, at{' '}
          {eventTime(window.opensAt.toISOString(), timezone)} on{' '}
          {eventDate(night.data.starts_at, timezone)}. Until then the list is on the previous
          screen.
        </Body>
      </Screen>
    );
  }
  if (window.state === 'over') {
    return (
      <Screen>
        <Title>That night is done</Title>
        <Body>
          Live closes six hours after the start time, so a stray tap cannot rewrite a list that has
          already happened.
        </Body>
      </Screen>
    );
  }

  const live = liveOrder(roster.data as LiveRow[]);
  const tone = timerTone(elapsed, setLength);
  const over = overBy(elapsed, setLength);

  function resetTimer() {
    setRunning(false);
    setElapsed(0);
    bankedRef.current = 0;
    buzzedRef.current = false;
  }

  /** Whoever is after the person on stage should be getting ready. */
  function putNextOnDeck(row: LiveRow | null) {
    if (row?.id && !row.on_deck_at) {
      onDeck.mutate({ signupId: row.id, onDeck: true });
    }
  }

  function start() {
    setRunning(true);
    putNextOnDeck(live.next);
  }

  function advance(status: 'performed' | 'no_show') {
    if (!live.current?.id) {
      return;
    }
    setStatus.mutate({ signupId: live.current.id, status });
    // Whoever was on deck is now on stage, so the flag comes off them and
    // moves one further down the list. Telling the person walking up to the
    // microphone to get ready is a beat too late to be worth anything.
    if (live.next?.id && live.next.on_deck_at) {
      onDeck.mutate({ signupId: live.next.id, onDeck: false });
    }
    putNextOnDeck(live.afterNext);
    resetTimer();
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Live',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />

      {live.current ? (
        <>
          <Text style={styles.label}>On stage now</Text>
          <Text style={styles.nowName}>{performerName(live.current)}</Text>
          <Text
            style={[
              styles.clock,
              tone === 'nearly' && styles.clockNearly,
              tone === 'over' && styles.clockOver,
            ]}
          >
            {formatClock(elapsed)}
          </Text>
          <Text style={styles.clockNote}>
            {over ?? (setLength ? `${setLength} minute sets` : 'No set length agreed for this mic')}
          </Text>

          <View style={styles.buttonRow}>
            <View style={styles.buttonFlex}>
              <Button
                label={running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start the set'}
                kind={running ? 'secondary' : 'primary'}
                onPress={() => (running ? setRunning(false) : start())}
              />
            </View>
            {elapsed > 0 ? (
              <View style={styles.buttonFlex}>
                <Button label="Reset" kind="secondary" onPress={resetTimer} />
              </View>
            ) : null}
          </View>

          {live.next ? (
            <View style={styles.nextBox}>
              <Ionicons name="arrow-forward" size={16} color={palette.warning} />
              <Text style={styles.nextText}>
                Up next: {performerName(live.next)}
                {live.next.on_deck_at ? ' (told they are on deck)' : ''}
              </Text>
            </View>
          ) : (
            <Body>Last one of the night.</Body>
          )}

          <Button
            label={live.next ? `Next up: ${performerName(live.next)}` : 'Finish the night'}
            busy={setStatus.isPending}
            onPress={() => advance('performed')}
          />
          <Button
            label={`${performerName(live.current)} did not show`}
            kind="secondary"
            onPress={() => advance('no_show')}
          />
        </>
      ) : (
        <>
          <Title>That is the whole list</Title>
          <Body>
            {live.done === 0
              ? 'Nobody is on the list for tonight yet. Names appear here as they sign up.'
              : `${live.done} performed. Anyone you promote off the waitlist shows up here.`}
          </Body>
        </>
      )}

      {setStatus.isError ? (
        <ErrorText>
          {setStatus.error instanceof Error
            ? setStatus.error.message
            : 'Could not update the list.'}
        </ErrorText>
      ) : null}
      {onDeck.isError ? (
        <ErrorText>
          {onDeck.error instanceof Error
            ? onDeck.error.message
            : 'Could not send the on deck note.'}
        </ErrorText>
      ) : null}

      <Text style={styles.label}>
        Running order ({live.done} of {live.order.length} done)
      </Text>
      {live.order.map((row, index) => {
        const isCurrent = row.id === live.current?.id;
        return (
          <View key={row.id} style={[styles.row, isCurrent && styles.rowCurrent]}>
            <Text style={styles.slot}>{index + 1}</Text>
            <Text
              style={[
                styles.rowName,
                row.status === 'performed' && styles.rowDone,
                row.status === 'no_show' && styles.rowNoShow,
              ]}
            >
              {performerName(row)}
            </Text>
            {row.status === 'performed' ? <Text style={styles.rowMeta}>done</Text> : null}
            {row.status === 'no_show' ? <Text style={styles.rowMeta}>no-show</Text> : null}
            {row.on_deck_at && !isCurrent ? <Text style={styles.onDeckMeta}>on deck</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  label: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  nowName: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.title.fontSize,
  },
  clock: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: 72,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  clockNearly: {
    color: palette.warning,
  },
  clockOver: {
    color: palette.danger,
  },
  clockNote: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonFlex: {
    flex: 1,
  },
  nextBox: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.warning,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  nextText: {
    color: palette.text,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  row: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowCurrent: {
    borderColor: palette.success,
  },
  slot: {
    color: palette.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: type.body.fontSize,
    width: 22,
  },
  rowName: {
    color: palette.text,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  rowDone: {
    color: palette.textSecondary,
    textDecorationLine: 'line-through',
  },
  rowNoShow: {
    color: palette.textDisabled,
    textDecorationLine: 'line-through',
  },
  rowMeta: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  onDeckMeta: {
    color: palette.warning,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
  },
});
