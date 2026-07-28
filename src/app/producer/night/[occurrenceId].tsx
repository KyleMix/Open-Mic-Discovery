import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import {
  useDrawLottery,
  useRoster,
  useSetSignupStatus,
  useSetSlotOrder,
  type RosterRow,
} from '@/features/signups/queries';
import { fonts, palette, spacing, type } from '@/theme';

/**
 * The producer's live list for one night: running order, lottery draw with
 * visible shuffle, waitlist promotion, and performed/no-show marking.
 * Realtime keeps every open copy of this screen in sync.
 */
export default function NightScreen() {
  const { occurrenceId } = useLocalSearchParams<{ occurrenceId: string }>();
  const roster = useRoster(occurrenceId);
  const draw = useDrawLottery();
  const reorder = useSetSlotOrder();
  const setStatus = useSetSignupStatus();

  // Visible randomization: shuffle names on screen while the server draws.
  const [shuffling, setShuffling] = useState<RosterRow[] | null>(null);
  const shuffleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (shuffleTimer.current) {
        clearInterval(shuffleTimer.current);
      }
    };
  }, []);

  if (roster.isPending) {
    return <LoadingView label="Loading the list" />;
  }
  if (roster.isError) {
    return (
      <Screen>
        <Title>The list</Title>
        <ErrorText>Could not load signups.</ErrorText>
        <Button label="Try again" onPress={() => roster.refetch()} />
      </Screen>
    );
  }

  const rows = shuffling ?? roster.data;
  const listed = rows.filter((r) =>
    ['confirmed', 'drawn', 'performed', 'no_show'].includes(r.status ?? ''),
  );
  const pending = rows.filter((r) => r.status === 'requested');
  const waitlist = rows.filter((r) => r.status === 'waitlisted');

  function startDraw() {
    if (!occurrenceId || roster.data == null) {
      return;
    }
    const pool = [...roster.data];
    setShuffling(pool);
    shuffleTimer.current = setInterval(() => {
      setShuffling((cur) => (cur ? [...cur].sort(() => Math.random() - 0.5) : cur));
    }, 120);
    draw.mutate(occurrenceId, {
      onSettled: () => {
        if (shuffleTimer.current) {
          clearInterval(shuffleTimer.current);
          shuffleTimer.current = null;
        }
        setShuffling(null);
      },
    });
  }

  function move(row: RosterRow, direction: -1 | 1) {
    if (!occurrenceId) {
      return;
    }
    const ordered = listed.filter((r) => r.slot_position != null);
    const index = ordered.findIndex((r) => r.id === row.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) {
      return;
    }
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate({ occurrenceId, signupIds: next.map((r) => r.id!).filter(Boolean) });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'The list',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />

      {pending.length > 0 ? (
        <View style={styles.drawBox}>
          <Text style={styles.sectionTitle}>
            {pending.length} in the draw{shuffling ? ': drawing...' : ''}
          </Text>
          {pending.map((r) => (
            <Text key={r.id} style={styles.pendingName}>
              {r.display_name ?? r.handle ?? 'Performer'}
            </Text>
          ))}
          {draw.isError ? (
            <ErrorText>
              {draw.error instanceof Error ? draw.error.message : 'Draw failed.'}
            </ErrorText>
          ) : null}
          <Button
            label={shuffling ? 'Drawing...' : 'Draw the lottery'}
            busy={!!shuffling || draw.isPending}
            onPress={startDraw}
          />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Running order</Text>
      {listed.length === 0 ? (
        <Body>Nobody on the list yet. Signups appear here in real time.</Body>
      ) : (
        listed.map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.slot}>{row.slot_position ?? '·'}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.name}>{row.display_name ?? row.handle ?? 'Performer'}</Text>
              <Text style={styles.meta}>{row.status}</Text>
            </View>
            {row.status === 'confirmed' || row.status === 'drawn' ? (
              <View style={styles.actions}>
                <IconAction label="Move up" icon="chevron-up" onPress={() => move(row, -1)} />
                <IconAction label="Move down" icon="chevron-down" onPress={() => move(row, 1)} />
                <IconAction
                  label="Mark performed"
                  icon="checkmark-circle"
                  color={palette.success}
                  onPress={() => setStatus.mutate({ signupId: row.id!, status: 'performed' })}
                />
                <IconAction
                  label="Mark no-show"
                  icon="close-circle"
                  color={palette.danger}
                  onPress={() => setStatus.mutate({ signupId: row.id!, status: 'no_show' })}
                />
              </View>
            ) : null}
          </View>
        ))
      )}

      {waitlist.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Waitlist</Text>
          {waitlist.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={styles.slot}>·</Text>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{row.display_name ?? row.handle ?? 'Performer'}</Text>
              </View>
              <Button
                label="Promote"
                kind="secondary"
                busy={setStatus.isPending}
                onPress={() => setStatus.mutate({ signupId: row.id!, status: 'confirmed' })}
              />
            </View>
          ))}
        </>
      ) : null}
      {setStatus.isError ? (
        <ErrorText>
          {setStatus.error instanceof Error ? setStatus.error.message : 'Could not update.'}
        </ErrorText>
      ) : null}
    </ScrollView>
  );
}

function IconAction({
  label,
  icon,
  color = palette.text,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.iconAction}
    >
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
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
  drawBox: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.warning,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    marginTop: spacing.sm,
  },
  pendingName: {
    color: palette.textSecondary,
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
  slot: {
    color: palette.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: type.body.fontSize,
    width: 22,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  meta: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 40,
  },
});
