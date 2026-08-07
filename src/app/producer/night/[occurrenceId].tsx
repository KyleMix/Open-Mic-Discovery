import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
import { ScreenHeader } from '@/components/screen-header';
import { formatRelativeDay } from '@/features/discovery/date-label';
import { liveWindow } from '@/features/live/window';
import { useNightAttendance, usePlanRoster } from '@/features/plans/queries';
import { attendanceSummary } from '@/features/plans/summary';
import { useNightContext, useOccurrenceContext } from '@/features/producer/queries';
import { isWalkIn } from '@/features/producer/signup-opens';
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
import { disciplineAccents, fonts, minTouchTarget, palette, spacing, type } from '@/theme';

/**
 * The producer's live list for one night: running order, lottery draw with
 * visible shuffle, waitlist promotion, and performed/no-show marking.
 * Realtime keeps every open copy of this screen in sync.
 */
export default function NightScreen() {
  const router = useRouter();
  const { occurrenceId } = useLocalSearchParams<{ occurrenceId: string }>();
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
    ? `${context.data.override_title ?? context.data.series.title} · ${formatRelativeDay(
        context.data.starts_at,
        context.data.series.timezone,
      )}`
    : 'The list';

  if (roster.isPending) {
    return (
      <>
        <ScreenHeader title={headerTitle} />
        <LoadingView label="Loading the list" />
      </>
    );
  }
  if (roster.isError) {
    return (
      <>
        <ScreenHeader title={headerTitle} />
        <Screen>
          <Title>The list</Title>
          <ErrorText>Could not load signups.</ErrorText>
          <Button label="Try again" onPress={() => roster.refetch()} />
        </Screen>
      </>
    );
  }

  const rows = shuffling ?? roster.data;
  const listed = rows.filter((r) =>
    ['confirmed', 'drawn', 'performed', 'no_show'].includes(r.status ?? ''),
  );
  const pending = rows.filter((r) => r.status === 'requested');
  const waitlist = rows.filter((r) => r.status === 'waitlisted');
  // Once somebody has been called up, the draw is closed server side: it
  // would renumber everyone still waiting on top of the positions the people
  // who already went up are holding. Say so here rather than offering a
  // button that only fails.
  const showStarted = rows.some((r) => r.status === 'performed' || r.status === 'no_show');
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
      // The shuffle animation is purely visual; a screen reader user
      // otherwise gets no signal that the draw finished.
      onSuccess: () =>
        AccessibilityInfo.announceForAccessibility('Draw complete. The running order is set.'),
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
    // Every listed row must carry an id; sending a partial array would
    // silently rewrite the running order with entries missing.
    const signupIds = next.map((r) => r.id);
    if (signupIds.some((id) => id == null)) {
      return;
    }
    reorder.mutate({ occurrenceId, signupIds: signupIds.filter((id): id is string => id != null) });
  }

  return (
    <KeyboardShift grow>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={roster.isFetching}
            onRefresh={roster.refetch}
            tintColor={palette.textSecondary}
          />
        }
      >
        <ScreenHeader title={headerTitle} />

        <LiveEntry
          occurrenceId={occurrenceId}
          onOpen={() => router.push(`/producer/live/${occurrenceId}`)}
        />

        <WhoIsComing occurrenceId={occurrenceId} />

        {pending.length > 0 ? (
          <View style={styles.drawBox}>
            <Text style={styles.sectionTitle}>
              {pending.length} in the draw{shuffling ? ': drawing...' : ''}
            </Text>
            {pending.map((r) => (
              <Text key={r.id} style={styles.pendingName}>
                {r.stage_name ?? r.handle ?? 'Performer'}
              </Text>
            ))}
            {draw.isError ? (
              <ErrorText>
                {draw.error instanceof Error ? draw.error.message : 'Draw failed.'}
              </ErrorText>
            ) : null}
            {showStarted ? (
              <Body>
                The show has started, so the draw is closed. Reorder the list or promote somebody
                off the waitlist instead: both keep everyone else where they are.
              </Body>
            ) : (
              <Button
                label={shuffling ? 'Drawing...' : 'Draw the lottery'}
                busy={!!shuffling || draw.isPending}
                onPress={startDraw}
              />
            )}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Running order</Text>
        {listed.length === 0 ? (
          <Body>Nobody on the list yet. Signups appear here in real time.</Body>
        ) : (
          listed.map((row) => (
            <View key={row.id} style={styles.rowStacked}>
              <View style={styles.rowTop}>
                <Text style={styles.slot}>{row.slot_position ?? '·'}</Text>
                <View style={styles.rowBody}>
                  <Text style={styles.name}>
                    {row.stage_name ?? row.handle ?? row.guest_name ?? 'Performer'}
                    {row.guest_name ? ' (walk-in)' : ''}
                  </Text>
                  <Text style={row.on_deck_at ? styles.onDeckMeta : styles.meta}>
                    {row.on_deck_at
                      ? 'On deck'
                      : row.status
                        ? ROSTER_STATUS_LABELS[row.status]
                        : ''}
                  </Text>
                </View>
              </View>
              {row.status === 'confirmed' || row.status === 'drawn' ? (
                <View style={styles.actions}>
                  <IconAction
                    label={
                      row.on_deck_at
                        ? `Take ${row.stage_name ?? 'performer'} off deck`
                        : `Put ${row.stage_name ?? 'performer'} on deck and notify them`
                    }
                    icon={row.on_deck_at ? 'megaphone' : 'megaphone-outline'}
                    color={row.on_deck_at ? palette.warning : palette.text}
                    onPress={() => {
                      if (row.id != null) {
                        onDeck.mutate({ signupId: row.id, onDeck: !row.on_deck_at });
                      }
                    }}
                  />
                  <IconAction label="Move up" icon="chevron-up" onPress={() => move(row, -1)} />
                  <IconAction label="Move down" icon="chevron-down" onPress={() => move(row, 1)} />
                  <IconAction
                    label="Mark performed"
                    icon="checkmark-circle"
                    color={palette.success}
                    onPress={() => {
                      if (row.id != null) {
                        setStatus.mutate({ signupId: row.id, status: 'performed' });
                      }
                    }}
                  />
                  <IconAction
                    label="Mark no-show"
                    icon="close-circle"
                    color={palette.danger}
                    onPress={() => setConfirmNoShow(row)}
                  />
                  {row.performer_id ? (
                    <IconAction
                      label={`Report or block ${row.stage_name ?? 'performer'}`}
                      icon="flag-outline"
                      onPress={() => setReporting(row)}
                    />
                  ) : null}
                </View>
              ) : row.status === 'performed' || row.status === 'no_show' ? (
                <IconAction
                  label={`Undo and put ${row.stage_name ?? 'performer'} back on the list`}
                  icon="arrow-undo"
                  onPress={() => {
                    if (row.id != null) {
                      setStatus.mutate({ signupId: row.id, status: 'confirmed' });
                    }
                  }}
                />
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
                    {row.stage_name ?? row.handle ?? row.guest_name ?? 'Performer'}
                    {row.guest_name ? ' (walk-in)' : ''}
                  </Text>
                </View>
                <Button
                  label="Promote"
                  kind="secondary"
                  busy={setStatus.isPending}
                  onPress={() => {
                    if (row.id != null) {
                      setStatus.mutate({ signupId: row.id, status: 'confirmed' });
                    }
                  }}
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
            title={`Mark ${confirmNoShow.stage_name ?? confirmNoShow.handle ?? 'this performer'} as a no-show?`}
            body="They are notified immediately and the mark stays on this night."
            confirmLabel="Mark no-show"
            onConfirm={() => {
              if (confirmNoShow.id != null) {
                setStatus.mutate({ signupId: confirmNoShow.id, status: 'no_show' });
              }
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
            targetLabel={reporting.stage_name ?? 'this performer'}
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

/**
 * The way in to running the night.
 *
 * Hidden until an hour before the door. A button offering to start a show
 * three days out is an invitation to mark the first performer done for a
 * night nobody has turned up to yet.
 */
function LiveEntry({
  occurrenceId,
  onOpen,
}: {
  occurrenceId: string | undefined;
  onOpen: () => void;
}) {
  const night = useNightContext(occurrenceId);
  if (!night.data) {
    return null;
  }
  const window = liveWindow(night.data.starts_at, new Date(), night.data.live_ended_at);
  if (window.state !== 'open') {
    return null;
  }
  return <Button label="Go live" onPress={onOpen} />;
}

/**
 * How the room is shaping up, before it fills.
 *
 * On a walk-in night the running order below is empty until people arrive and
 * sign the sheet, so without this the producer has nothing to plan from. The
 * names are stage names, which is what the performer was told would be shown.
 */
function WhoIsComing({ occurrenceId }: { occurrenceId: string | undefined }) {
  const night = useNightContext(occurrenceId);
  const counts = useNightAttendance(occurrenceId);
  const roster = usePlanRoster(occurrenceId);

  if (counts.isPending || !counts.data) {
    return null;
  }

  const method = night.data?.series?.signup_method;
  const summary = attendanceSummary(counts.data, method ? isWalkIn(method) : false);
  const names = roster.data ?? [];

  return (
    <View style={styles.comingBox}>
      <Text style={styles.sectionTitle}>Who is coming</Text>
      <Body>{summary}</Body>
      {names.length > 0 ? (
        <Text style={styles.pendingName}>
          {names
            .map(
              (n) =>
                `${n.stage_name ?? n.handle ?? 'Someone'}${n.is_performer ? '' : ' (watching)'}`,
            )
            .join(', ')}
        </Text>
      ) : null}
      {night.data?.featured_name ? (
        <Text style={styles.featured}>Featuring {night.data.featured_name}</Text>
      ) : null}
    </View>
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
  comingBox: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  featured: {
    color: disciplineAccents.music,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
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
  // Running-order rows stack identity over actions so all six controls
  // keep full-size touch targets on a small phone.
  rowStacked: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // The slot number is the fact a host checks at a glance in a dark bar;
  // it reads bigger and brighter than the name, in a column that grows
  // instead of clipping two digits or scaled type.
  slot: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    minWidth: 28,
    textAlign: 'center',
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
    flexWrap: 'wrap',
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
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
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
