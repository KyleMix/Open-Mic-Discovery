import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
import { useSession } from '@/features/auth/session';
import { useOccurrenceContext } from '@/features/producer/queries';
import { useProStatus } from '@/features/pro/use-pro';
import { ReportModal } from '@/features/safety/components/report-modal';
import { ROSTER_STATUS_LABELS } from '@/features/signups/labels';
import {
  useAddWalkIn,
  useDrawLottery,
  useMarkOnDeck,
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
  const router = useRouter();
  const { occurrenceId } = useLocalSearchParams<{ occurrenceId: string }>();
  const { session } = useSession();
  const pro = useProStatus(session?.user.id);
  const roster = useRoster(occurrenceId);
  const context = useOccurrenceContext(occurrenceId);
  const draw = useDrawLottery();
  const reorder = useSetSlotOrder();
  const setStatus = useSetSignupStatus();
  const onDeck = useMarkOnDeck();
  const addWalkIn = useAddWalkIn();
  const [walkInName, setWalkInName] = useState('');

  // Visible randomization: shuffle names on screen while the server draws.
  const [shuffling, setShuffling] = useState<RosterRow[] | null>(null);
  const [reporting, setReporting] = useState<RosterRow | null>(null);
  const [confirmNoShow, setConfirmNoShow] = useState<RosterRow | null>(null);
  const [confirmRedraw, setConfirmRedraw] = useState(false);
  const shuffleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (shuffleTimer.current) {
        clearInterval(shuffleTimer.current);
      }
    };
  }, []);

  // A host running two mics needs the screen to say which night this is.
  const headerTitle = context.data?.series
    ? `${context.data.override_title ?? context.data.series.title} · ${new Date(
        context.data.starts_at,
      ).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
    : 'The list';

  // Waiting for the entitlement too: rendering the paid controls to a free
  // producer for a beat, then yanking them, reads as a broken screen.
  if (roster.isPending || pro.isPending) {
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
  const canManage = pro.data?.entitled ?? false;

  // Free producers see the list; running it (draw, order, statuses) is Pro.
  if (pro.data && !canManage) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: headerTitle,
            headerStyle: { backgroundColor: palette.bg },
            headerTintColor: palette.text,
          }}
        />
        <Text style={styles.sectionTitle}>
          {rows.length} {rows.length === 1 ? 'performer' : 'performers'} signed up
        </Text>
        {rows.map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.slot}>{row.slot_position ?? '·'}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.name}>
                {row.display_name ?? row.handle ?? row.guest_name ?? 'Performer'}
                {row.guest_name ? ' (walk-in)' : ''}
              </Text>
              <Text style={styles.meta}>{row.status ? ROSTER_STATUS_LABELS[row.status] : ''}</Text>
            </View>
          </View>
        ))}
        <Body>
          Running the list, drawing lotteries, reordering, and marking performed or no-show are part
          of Producer Pro.
        </Body>
        <Button label="See Producer Pro" onPress={() => router.push('/paywall')} />
      </ScrollView>
    );
  }

  function startDraw() {
    if (!occurrenceId || roster.data == null) {
      return;
    }
    // Re-drawing shuffles people who were already told they are on; that
    // deserves a deliberate confirmation, not a second tap.
    if (roster.data.some((r) => r.status === 'drawn' || r.status === 'waitlisted')) {
      setConfirmRedraw(true);
      return;
    }
    runDraw();
  }

  function runDraw() {
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
    <KeyboardShift grow>
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
                <Text style={styles.name}>
                  {row.display_name ?? row.handle ?? row.guest_name ?? 'Performer'}
                  {row.guest_name ? ' (walk-in)' : ''}
                </Text>
                <Text style={row.on_deck_at ? styles.onDeckMeta : styles.meta}>
                  {row.on_deck_at ? 'On deck' : row.status ? ROSTER_STATUS_LABELS[row.status] : ''}
                </Text>
              </View>
              {row.status === 'confirmed' || row.status === 'drawn' ? (
                <View style={styles.actions}>
                  <IconAction
                    label={
                      row.on_deck_at
                        ? `Take ${row.display_name ?? 'performer'} off deck`
                        : `Put ${row.display_name ?? 'performer'} on deck and notify them`
                    }
                    icon={row.on_deck_at ? 'megaphone' : 'megaphone-outline'}
                    color={row.on_deck_at ? palette.warning : palette.text}
                    onPress={() => onDeck.mutate({ signupId: row.id!, onDeck: !row.on_deck_at })}
                  />
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
                    onPress={() => setConfirmNoShow(row)}
                  />
                  {row.performer_id ? (
                    <IconAction
                      label={`Report or block ${row.display_name ?? 'performer'}`}
                      icon="flag-outline"
                      onPress={() => setReporting(row)}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          ))
        )}

        <View style={styles.walkInRow}>
          <View style={styles.walkInField}>
            <Field
              label="Add a walk-in"
              value={walkInName}
              onChangeText={setWalkInName}
              placeholder="Name at the door"
            />
          </View>
          <Button
            label="Add"
            busy={addWalkIn.isPending}
            disabled={!walkInName.trim() || !occurrenceId}
            onPress={() =>
              addWalkIn.mutate(
                { occurrenceId: occurrenceId!, guestName: walkInName.trim() },
                { onSuccess: () => setWalkInName('') },
              )
            }
          />
        </View>
        {addWalkIn.isError ? (
          <ErrorText>
            {addWalkIn.error instanceof Error ? addWalkIn.error.message : 'Could not add them.'}
          </ErrorText>
        ) : null}

        {waitlist.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Waitlist</Text>
            {waitlist.map((row) => (
              <View key={row.id} style={styles.row}>
                <Text style={styles.slot}>·</Text>
                <View style={styles.rowBody}>
                  <Text style={styles.name}>
                    {row.display_name ?? row.handle ?? row.guest_name ?? 'Performer'}
                    {row.guest_name ? ' (walk-in)' : ''}
                  </Text>
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
        {onDeck.isError ? (
          <ErrorText>
            {onDeck.error instanceof Error ? onDeck.error.message : 'Could not update on deck.'}
          </ErrorText>
        ) : null}
        {reorder.isError ? (
          <ErrorText>
            {reorder.error instanceof Error ? reorder.error.message : 'Could not reorder the list.'}
          </ErrorText>
        ) : null}
        {confirmNoShow ? (
          <ConfirmSheet
            title={`Mark ${confirmNoShow.display_name ?? confirmNoShow.handle ?? 'this performer'} as a no-show?`}
            body="They are notified immediately and the mark stays on this night."
            confirmLabel="Mark no-show"
            onConfirm={() => {
              setStatus.mutate({ signupId: confirmNoShow.id!, status: 'no_show' });
              setConfirmNoShow(null);
            }}
            onClose={() => setConfirmNoShow(null)}
          />
        ) : null}
        {confirmRedraw ? (
          <ConfirmSheet
            title="Draw again?"
            body="A new draw reshuffles everyone, including performers already told they are on. The current order is replaced."
            confirmLabel="Re-draw the lottery"
            onConfirm={() => {
              setConfirmRedraw(false);
              runDraw();
            }}
            onClose={() => setConfirmRedraw(false)}
          />
        ) : null}
        {reporting?.performer_id ? (
          <ReportModal
            visible
            onClose={() => setReporting(null)}
            targetType="profile"
            targetId={reporting.performer_id}
            blockableUserId={reporting.performer_id}
            targetLabel={reporting.display_name ?? 'this performer'}
          />
        ) : null}
      </ScrollView>
    </KeyboardShift>
  );
}

function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Body>{body}</Body>
          <Button label={confirmLabel} onPress={onConfirm} />
          <Button label="Back" kind="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
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
  onDeckMeta: {
    color: palette.warning,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  walkInRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  walkInField: {
    flex: 1,
  },
  iconAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 40,
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
});
