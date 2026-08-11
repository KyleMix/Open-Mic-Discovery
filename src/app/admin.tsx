import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConfirmSheet } from '@/components/confirm-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import {
  FLAG_REASON_LABELS,
  REPORT_REASON_LABELS,
  REPORT_TARGET_LABELS,
} from '@/features/safety/labels';
import {
  useIsAdminReader,
  useModerateContent,
  useModerationQueue,
  useResolveFlag,
  useResolveReport,
} from '@/features/safety/queries';
import { fonts, maxFontScale, palette, radius, spacing, type } from '@/theme';

/**
 * The moderation queue (Guideline 1.2): held content, abuse reports, and
 * data-quality flags, with a documented 24-hour response target.
 */
export default function AdminScreen() {
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const isAdmin = profile.data?.is_admin ?? false;
  // Read-only reviewers on the admin allowlist see the queue without the
  // action buttons; the server re-checks every write regardless.
  const reader = useIsAdminReader(session?.user.id);
  const canRead = isAdmin || (reader.data ?? false);
  const queue = useModerationQueue(canRead);
  const moderate = useModerateContent();
  const resolveReport = useResolveReport();
  const resolveFlag = useResolveFlag();
  // Taking content down is one-way from this screen; it asks first.
  const [confirmTakedown, setConfirmTakedown] = useState<{
    reportId: string;
    target: { type: keyof typeof REPORT_TARGET_LABELS; id: string };
  } | null>(null);

  if (!session) {
    return (
      <>
        <ScreenHeader title="Moderation queue" />
        <Screen>
          <Title>Moderation</Title>
          <Body>This area is for moderators.</Body>
        </Screen>
      </>
    );
  }
  if (profile.isPending || reader.isPending) {
    return (
      <>
        <ScreenHeader title="Moderation queue" />
        <LoadingView label="Loading" />
      </>
    );
  }
  if (!canRead) {
    return (
      <>
        <ScreenHeader title="Moderation queue" />
        <Screen>
          <Title>Moderation</Title>
          <Body>This area is for moderators.</Body>
        </Screen>
      </>
    );
  }
  if (queue.isPending) {
    return (
      <>
        <ScreenHeader title="Moderation queue" />
        <LoadingView label="Loading the queue" />
      </>
    );
  }
  if (queue.isError) {
    return (
      <>
        <ScreenHeader title="Moderation queue" />
        <Screen>
          <Title>Moderation</Title>
          <ErrorText>Could not load the queue.</ErrorText>
          <Button label="Try again" onPress={() => queue.refetch()} />
        </Screen>
      </>
    );
  }

  const q = queue.data;
  const empty =
    q.profiles.length + q.venues.length + q.series.length + q.reports.length + q.flags.length === 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={queue.isFetching}
          onRefresh={queue.refetch}
          tintColor={palette.textSecondary}
        />
      }
    >
      <ScreenHeader title="Moderation queue" />
      <Body>Response target: every item here is actioned within 24 hours.</Body>
      {!isAdmin ? (
        <Body>You have read-only access: you can review the queue but not act on it.</Body>
      ) : null}
      {empty ? <Body>Queue is clear. Nothing needs review.</Body> : null}

      {q.reports.length > 0 ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
          Abuse reports
        </Text>
      ) : null}
      {resolveReport.isError ? (
        <ErrorText>
          {resolveReport.error instanceof Error
            ? resolveReport.error.message
            : 'Could not resolve the report. Try again.'}
        </ErrorText>
      ) : null}
      {q.reports.map((r) => (
        <View key={r.id} style={styles.item}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemTitle}>
            {REPORT_TARGET_LABELS[r.target_type]}: {REPORT_REASON_LABELS[r.reason]}
          </Text>
          {r.targetLabel ? (
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
              {r.targetLabel}
            </Text>
          ) : null}
          {r.details ? (
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
              Reporter: {r.details}
            </Text>
          ) : null}
          {isAdmin ? (
            <View style={styles.actions}>
              <Button
                label="Take down"
                busy={resolveReport.isPending}
                onPress={() =>
                  setConfirmTakedown({
                    reportId: r.id,
                    target: { type: r.target_type, id: r.target_id },
                  })
                }
              />
              <Button
                label="Dismiss"
                kind="secondary"
                busy={resolveReport.isPending}
                onPress={() =>
                  resolveReport.mutate({
                    reportId: r.id,
                    adminId: session.user.id,
                    actioned: false,
                  })
                }
              />
            </View>
          ) : null}
        </View>
      ))}

      {q.profiles.length + q.venues.length + q.series.length + q.credits.length > 0 ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
          Held content
        </Text>
      ) : null}
      {moderate.isError ? (
        <ErrorText>
          {moderate.error instanceof Error
            ? moderate.error.message
            : 'Could not save the decision. Try again.'}
        </ErrorText>
      ) : null}
      {q.profiles.map((p) => (
        <ModerationItem
          key={p.id}
          title={`Profile @${p.handle}`}
          body={`${p.stage_name}${p.bio ? `: ${p.bio}` : ''}`}
          busy={moderate.isPending}
          canAct={isAdmin}
          onDecide={(approve) => moderate.mutate({ target: 'profile', targetId: p.id, approve })}
        />
      ))}
      {q.venues.map((v) => (
        <ModerationItem
          key={v.id}
          title={`Venue: ${v.name}`}
          body={v.parking_notes ?? ''}
          busy={moderate.isPending}
          canAct={isAdmin}
          onDecide={(approve) => moderate.mutate({ target: 'venue', targetId: v.id, approve })}
        />
      ))}
      {q.series.map((s) => (
        <ModerationItem
          key={s.id}
          title={`Listing: ${s.title}`}
          body={s.description ?? ''}
          busy={moderate.isPending}
          canAct={isAdmin}
          onDecide={(approve) => moderate.mutate({ target: 'series', targetId: s.id, approve })}
        />
      ))}
      {q.credits.map((c) => (
        <ModerationItem
          key={c.id}
          title={`Lineup credit on ${c.series?.title ?? 'a listing'}`}
          body={`${c.role}: ${c.name ?? 'linked account'}`}
          busy={moderate.isPending}
          canAct={isAdmin}
          onDecide={(approve) => moderate.mutate({ target: 'credit', targetId: c.id, approve })}
        />
      ))}

      {q.flags.length > 0 ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
          Listing flags
        </Text>
      ) : null}
      {resolveFlag.isError ? (
        <ErrorText>
          {resolveFlag.error instanceof Error
            ? resolveFlag.error.message
            : 'Could not resolve the flag. Try again.'}
        </ErrorText>
      ) : null}
      {q.flags.map((f) => (
        <View key={f.id} style={styles.item}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemTitle}>
            {f.series?.title ?? 'Listing'}: {FLAG_REASON_LABELS[f.reason]}
          </Text>
          {f.details ? (
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
              {f.details}
            </Text>
          ) : null}
          {isAdmin ? (
            <View style={styles.actions}>
              <Button
                label="Confirmed"
                busy={resolveFlag.isPending}
                onPress={() =>
                  resolveFlag.mutate({ flagId: f.id, adminId: session.user.id, confirmed: true })
                }
              />
              <Button
                label="Dismiss"
                kind="secondary"
                busy={resolveFlag.isPending}
                onPress={() =>
                  resolveFlag.mutate({ flagId: f.id, adminId: session.user.id, confirmed: false })
                }
              />
            </View>
          ) : null}
        </View>
      ))}

      {confirmTakedown ? (
        <ConfirmSheet
          title={`Take down this ${REPORT_TARGET_LABELS[confirmTakedown.target.type].toLowerCase()}?`}
          body="The content comes down right away and the report is closed. There is no undo from this screen."
          confirmLabel="Take it down"
          onConfirm={() => {
            resolveReport.mutate({
              reportId: confirmTakedown.reportId,
              adminId: session.user.id,
              actioned: true,
              target: confirmTakedown.target,
            });
            setConfirmTakedown(null);
          }}
          onClose={() => setConfirmTakedown(null)}
        />
      ) : null}
    </ScrollView>
  );
}

function ModerationItem({
  title,
  body,
  busy,
  canAct,
  onDecide,
}: {
  title: string;
  body: string;
  busy: boolean;
  canAct: boolean;
  onDecide: (approve: boolean) => void;
}) {
  return (
    <View style={styles.item}>
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemTitle}>
        {title}
      </Text>
      {body ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
          {body}
        </Text>
      ) : null}
      {canAct ? (
        <View style={styles.actions}>
          <Button label="Approve" busy={busy} onPress={() => onDecide(true)} />
          <Button label="Reject" kind="secondary" busy={busy} onPress={() => onDecide(false)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    marginTop: spacing.sm,
  },
  item: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  itemTitle: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  itemBody: {
    color: palette.textSecondary,
    fontFamily: fonts.regular,
    fontSize: type.caption.fontSize,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
