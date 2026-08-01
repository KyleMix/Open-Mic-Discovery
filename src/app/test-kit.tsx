import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import {
  useFillRoster,
  useResetTestData,
  useSeedScenario,
  useSetTestKitEnabled,
  useSetTestRoles,
  useShiftOccurrence,
  useTestKitStatus,
} from '@/features/testkit/queries';
import {
  scenarios,
  shiftLabel,
  shiftOffsets,
  type ScenarioKey,
} from '@/features/testkit/scenarios';
import { useTestOverridesStore, type ProOverride } from '@/stores/test-overrides';
import { disciplineAccents, fonts, minTouchTarget, palette, spacing, type } from '@/theme';

/**
 * Testing tools: build a whole situation in one tap, look at it, throw it
 * away. Admin only, and every action is refused server side for anyone else.
 *
 * Everything created here is tracked, so "Remove all test data" puts the
 * database back exactly where it was. Real listings are never touched, even
 * when test performers were added to one of their nights.
 */
export default function TestKitScreen() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const isAdmin = profile.data?.is_admin ?? false;

  const status = useTestKitStatus(isAdmin);
  const seed = useSeedScenario();
  const fillRoster = useFillRoster();
  const shift = useShiftOccurrence();
  const setRoles = useSetTestRoles();
  const setEnabled = useSetTestKitEnabled();
  const reset = useResetTestData();

  const proOverride = useTestOverridesStore((s) => s.proOverride);
  const setProOverride = useTestOverridesStore((s) => s.setProOverride);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastResult, setLastResult] = useState<{
    seriesId?: string;
    occurrenceId?: string;
  } | null>(null);

  if (profile.isPending) {
    return <LoadingView label="Loading" />;
  }
  if (!isAdmin || !session) {
    return (
      <Screen>
        <Title>Testing tools</Title>
        <Body>This area is for the app owner.</Body>
      </Screen>
    );
  }
  if (status.isPending) {
    return <LoadingView label="Loading the test kit" />;
  }
  if (status.isError) {
    return (
      <Screen>
        <Title>Testing tools</Title>
        <ErrorText>Could not reach the test kit. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => status.refetch()} />
      </Screen>
    );
  }

  const s = status.data;
  const busy =
    seed.isPending ||
    fillRoster.isPending ||
    shift.isPending ||
    setRoles.isPending ||
    reset.isPending;
  const totalObjects = Object.values(s.counts).reduce((sum, n) => sum + n, 0);
  const night = s.next_night;

  const run = (label: string, promise: Promise<unknown>) => {
    setError(null);
    setMessage(null);
    promise
      .then(() => setMessage(label))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'That did not work.'));
  };

  const onSeed = (key: ScenarioKey) => {
    setError(null);
    setMessage(null);
    seed
      .mutateAsync(key)
      .then((result) => {
        setMessage(result.summary);
        setLastResult({ seriesId: result.series_id, occurrenceId: result.occurrence_id });
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not build that scenario.'),
      );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Testing tools',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />

      <Body>
        Build a whole situation in one tap, look at it, then remove it. Nothing here touches a real
        listing, and everything it creates can be undone at the bottom of this screen.
      </Body>

      {!s.enabled ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            The test kit is switched off for this environment. Switch it back on to use it.
          </Text>
          <Button
            label="Switch the test kit on"
            busy={setEnabled.isPending}
            onPress={() => run('Test kit switched on.', setEnabled.mutateAsync(true))}
          />
        </View>
      ) : null}

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {lastResult?.occurrenceId || lastResult?.seriesId ? (
        <View style={styles.actions}>
          {lastResult.occurrenceId ? (
            <Button
              label="Open the roster"
              onPress={() => router.push(`/producer/night/${lastResult.occurrenceId}`)}
            />
          ) : null}
          {lastResult.seriesId ? (
            <Button
              label="Open the listing"
              kind="secondary"
              onPress={() => router.push(`/mic/${lastResult.seriesId}`)}
            />
          ) : null}
        </View>
      ) : null}

      {/* ----------------------------------------------------------------- */}
      <Text style={styles.sectionTitle}>Build a scenario</Text>
      {scenarios.map((scenario) => (
        <View key={scenario.key} style={styles.item}>
          <Text style={styles.itemTitle}>{scenario.label}</Text>
          <Text style={styles.itemBody}>{scenario.detail}</Text>
          <Text style={styles.itemCaption}>Check: {scenario.checks}</Text>
          <Button
            label="Set it up"
            busy={seed.isPending && seed.variables === scenario.key}
            disabled={busy || !s.enabled}
            onPress={() => onSeed(scenario.key)}
          />
        </View>
      ))}

      {/* ----------------------------------------------------------------- */}
      <Text style={styles.sectionTitle}>The next test night</Text>
      {night ? (
        <View style={styles.item}>
          <Text style={styles.itemTitle}>{night.title}</Text>
          <Text style={styles.itemBody}>
            {new Date(night.starts_at).toLocaleString()} (in your device timezone)
          </Text>
          <Text style={styles.itemCaption}>
            Move it closer to see signups close, the night-of view open, and day-of reminders fire
            without waiting.
          </Text>
          <View style={styles.chipRow}>
            {shiftOffsets.map((minutes) => (
              <Chip
                key={minutes}
                label={shiftLabel(minutes)}
                disabled={busy}
                onPress={() =>
                  run(
                    `Moved to ${shiftLabel(minutes)} from now.`,
                    shift.mutateAsync({ occurrenceId: night.occurrence_id, minutes }),
                  )
                }
              />
            ))}
          </View>
          <View style={styles.actions}>
            <Button
              label="Add 3 performers"
              kind="secondary"
              disabled={busy}
              onPress={() =>
                run(
                  'Added performers to the list.',
                  fillRoster.mutateAsync({ occurrenceId: night.occurrence_id, count: 3 }),
                )
              }
            />
            <Button
              label="Open the roster"
              onPress={() => router.push(`/producer/night/${night.occurrence_id}`)}
            />
          </View>
        </View>
      ) : (
        <Body>No test nights yet. Build a scenario above and this fills in.</Body>
      )}

      {/* ----------------------------------------------------------------- */}
      <Text style={styles.sectionTitle}>Your roles</Text>
      <View style={styles.item}>
        <Text style={styles.itemBody}>
          Turn a role off to see the app the way somebody without it sees it. Your admin access
          stays on, so you can always come back here.
        </Text>
        <View style={styles.chipRow}>
          <Chip
            label="Performer"
            active={profile.data?.is_performer ?? false}
            disabled={busy}
            accent={disciplineAccents.music}
            onPress={() =>
              run(
                'Roles updated.',
                setRoles.mutateAsync({
                  performer: !(profile.data?.is_performer ?? false),
                  producer: profile.data?.is_producer ?? false,
                }),
              )
            }
          />
          <Chip
            label="Producer"
            active={profile.data?.is_producer ?? false}
            disabled={busy}
            accent={disciplineAccents.comedy}
            onPress={() =>
              run(
                'Roles updated.',
                setRoles.mutateAsync({
                  performer: profile.data?.is_performer ?? false,
                  producer: !(profile.data?.is_producer ?? false),
                }),
              )
            }
          />
        </View>
      </View>

      {/* ----------------------------------------------------------------- */}
      <Text style={styles.sectionTitle}>Producer Pro</Text>
      <View style={styles.item}>
        <Text style={styles.itemBody}>
          Force the subscription gate either way, on this device only, without buying anything. It
          clears when you restart the app.
        </Text>
        <View style={styles.chipRow}>
          {(
            [
              { key: 'off', label: 'Normal' },
              { key: 'entitled', label: 'Pro unlocked' },
              { key: 'locked', label: 'Pro locked' },
            ] as { key: ProOverride; label: string }[]
          ).map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              active={proOverride === option.key}
              accent={disciplineAccents.poetry}
              onPress={() => {
                setProOverride(option.key);
                setMessage(`Producer Pro: ${option.label.toLowerCase()}.`);
              }}
            />
          ))}
        </View>
      </View>

      {/* ----------------------------------------------------------------- */}
      <Text style={styles.sectionTitle}>Test sign-ins</Text>
      <View style={styles.item}>
        <Text style={styles.itemBody}>
          Every generated account uses the password {s.password}. Sign in as one on a second device
          to watch a roster update live from both sides.
        </Text>
        {s.logins.length === 0 ? (
          <Text style={styles.itemCaption}>None yet. Scenarios create them as they need them.</Text>
        ) : (
          s.logins.map((login) => (
            <Text key={login.email} style={styles.itemCaption}>
              {login.name}: {login.email}
            </Text>
          ))
        )}
      </View>

      {/* ----------------------------------------------------------------- */}
      <Text style={styles.sectionTitle}>Clean up</Text>
      <View style={styles.item}>
        <Text style={styles.itemBody}>
          {totalObjects === 0
            ? 'Nothing to clean up. The test kit has not created anything.'
            : `${totalObjects} test records exist right now: listings, venues, accounts, and signups. Removing them leaves everything real untouched.`}
        </Text>
        {confirmingReset ? (
          <View style={styles.actions}>
            <Button
              label="Yes, remove it all"
              busy={reset.isPending}
              onPress={() => {
                setConfirmingReset(false);
                setLastResult(null);
                run('Test data removed.', reset.mutateAsync());
              }}
            />
            <Button label="Keep it" kind="secondary" onPress={() => setConfirmingReset(false)} />
          </View>
        ) : (
          <Button
            label="Remove all test data"
            kind="secondary"
            disabled={busy || totalObjects === 0}
            onPress={() => setConfirmingReset(true)}
          />
        )}
      </View>

      <View style={styles.item}>
        <Text style={styles.itemBody}>
          Before you submit to the stores, switch the test kit off. Nobody but an admin can reach it
          either way, and you can switch it back on from this screen.
        </Text>
        <Button
          label={s.enabled ? 'Switch the test kit off' : 'Switch the test kit on'}
          kind="secondary"
          busy={setEnabled.isPending}
          onPress={() =>
            run(
              s.enabled ? 'Test kit switched off.' : 'Test kit switched on.',
              setEnabled.mutateAsync(!s.enabled),
            )
          }
        />
      </View>
    </ScrollView>
  );
}

function Chip({
  label,
  onPress,
  active = false,
  disabled = false,
  accent = palette.text,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  accent?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { borderColor: accent },
        pressed && styles.chipPressed,
        disabled && styles.chipDisabled,
      ]}
    >
      <Text style={[styles.chipLabel, active && { color: accent }]}>{label}</Text>
    </Pressable>
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
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  itemCaption: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: palette.bg,
    borderColor: palette.border,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: minTouchTarget - 4,
    paddingHorizontal: spacing.md,
  },
  chipPressed: {
    backgroundColor: palette.bgPressed,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
  },
  notice: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeText: {
    color: palette.text,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  success: {
    color: palette.success,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
});
