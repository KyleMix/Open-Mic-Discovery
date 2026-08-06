import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import {
  FLAG_REASON_LABELS,
  REPORT_REASON_LABELS,
  REPORT_TARGET_LABELS,
} from '@/features/safety/labels';
import {
  useModerateContent,
  useModerationQueue,
  useResolveFlag,
  useResolveReport,
} from '@/features/safety/queries';
import { fonts, palette, spacing, type } from '@/theme';

/**
 * The moderation queue (Guideline 1.2): held content, abuse reports, and
 * data-quality flags, with a documented 24-hour response target.
 */
export default function AdminScreen() {
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const isAdmin = profile.data?.is_admin ?? false;
  const queue = useModerationQueue(isAdmin);
  const moderate = useModerateContent();
  const resolveReport = useResolveReport();
  const resolveFlag = useResolveFlag();

  if (profile.isPending) {
    return <LoadingView label="Loading" />;
  }
  if (!isAdmin || !session) {
    return (
      <Screen>
        <Title>Moderation</Title>
        <Body>This area is for moderators.</Body>
      </Screen>
    );
  }
  if (queue.isPending) {
    return <LoadingView label="Loading the queue" />;
  }
  if (queue.isError) {
    return (
      <Screen>
        <Title>Moderation</Title>
        <ErrorText>Could not load the queue.</ErrorText>
        <Button label="Try again" onPress={() => queue.refetch()} />
      </Screen>
    );
  }

  const q = queue.data;
  const empty =
    q.profiles.length + q.venues.length + q.series.length + q.reports.length + q.flags.length === 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Moderation queue',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />
      <Body>Response target: every item here is actioned within 24 hours.</Body>
      {empty ? <Body>Queue is clear. Nothing needs review.</Body> : null}

      {q.reports.length > 0 ? <Text style={styles.sectionTitle}>Abuse reports</Text> : null}
      {q.reports.map((r) => (
        <View key={r.id} style={styles.item}>
          <Text style={styles.itemTitle}>
            {REPORT_TARGET_LABELS[r.target_type]}: {REPORT_REASON_LABELS[r.reason]}
          </Text>
          {r.details ? <Text style={styles.itemBody}>{r.details}</Text> : null}
          <View style={styles.actions}>
            <Button
              label="Actioned"
              busy={resolveReport.isPending}
              onPress={() =>
                resolveReport.mutate({ reportId: r.id, adminId: session.user.id, actioned: true })
              }
            />
            <Button
              label="Dismiss"
              kind="secondary"
              busy={resolveReport.isPending}
              onPress={() =>
                resolveReport.mutate({ reportId: r.id, adminId: session.user.id, actioned: false })
              }
            />
          </View>
        </View>
      ))}

      {q.profiles.length + q.venues.length + q.series.length > 0 ? (
        <Text style={styles.sectionTitle}>Held content</Text>
      ) : null}
      {q.profiles.map((p) => (
        <ModerationItem
          key={p.id}
          title={`Profile @${p.handle}`}
          body={`${p.stage_name}${p.bio ? `: ${p.bio}` : ''}`}
          busy={moderate.isPending}
          onDecide={(approve) => moderate.mutate({ target: 'profile', targetId: p.id, approve })}
        />
      ))}
      {q.venues.map((v) => (
        <ModerationItem
          key={v.id}
          title={`Venue: ${v.name}`}
          body={v.parking_notes ?? ''}
          busy={moderate.isPending}
          onDecide={(approve) => moderate.mutate({ target: 'venue', targetId: v.id, approve })}
        />
      ))}
      {q.series.map((s) => (
        <ModerationItem
          key={s.id}
          title={`Listing: ${s.title}`}
          body={s.description ?? ''}
          busy={moderate.isPending}
          onDecide={(approve) => moderate.mutate({ target: 'series', targetId: s.id, approve })}
        />
      ))}

      {q.flags.length > 0 ? <Text style={styles.sectionTitle}>Listing flags</Text> : null}
      {q.flags.map((f) => (
        <View key={f.id} style={styles.item}>
          <Text style={styles.itemTitle}>
            {f.series?.title ?? 'Listing'}: {FLAG_REASON_LABELS[f.reason]}
          </Text>
          {f.details ? <Text style={styles.itemBody}>{f.details}</Text> : null}
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
        </View>
      ))}
    </ScrollView>
  );
}

function ModerationItem({
  title,
  body,
  busy,
  onDecide,
}: {
  title: string;
  body: string;
  busy: boolean;
  onDecide: (approve: boolean) => void;
}) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemTitle}>{title}</Text>
      {body ? <Text style={styles.itemBody}>{body}</Text> : null}
      <View style={styles.actions}>
        <Button label="Approve" busy={busy} onPress={() => onDecide(true)} />
        <Button label="Reject" kind="secondary" busy={busy} onPress={() => onDecide(false)} />
      </View>
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
    borderRadius: 12,
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
    fontSize: type.caption.fontSize,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
