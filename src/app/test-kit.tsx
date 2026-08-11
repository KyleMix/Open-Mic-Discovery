import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import {
  EXPECTED_KIT_VERSION,
  useFillRoster,
  useResetTestData,
  useRestartNight,
  useSeedScenario,
  useSetTestKitEnabled,
  useSetTestRoles,
  useShiftOccurrence,
  useTestKitStatus,
} from '@/features/testkit/queries';
import {
  destinationPath,
  scenarios,
  shiftLabel,
  shiftOffsets,
  type Scenario,
} from '@/features/testkit/scenarios';
import {
  disciplineAccents,
  fonts,
  maxFontScale,
  minTouchTarget,
  palette,
  radius,
  spacing,
  type,
} from '@/theme';

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
  const restart = useRestartNight();
  const reset = useResetTestData();

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Session before profile: a disabled query is pending forever, so the
  // old order left a signed-out deep link on a spinner for good. And every
  // branch renders the header, or the root stack's headerShown: false
  // leaves these screens with no back button.
  if (!session) {
    return (
      <>
        <ScreenHeader title="Testing tools" />
        <Screen>
          <Title>Testing tools</Title>
          <Body>This area is for the app owner.</Body>
        </Screen>
      </>
    );
  }
  if (profile.isPending) {
    return (
      <>
        <ScreenHeader title="Testing tools" />
        <LoadingView label="Loading" />
      </>
    );
  }
  if (!isAdmin) {
    return (
      <>
        <ScreenHeader title="Testing tools" />
        <Screen>
          <Title>Testing tools</Title>
          <Body>This area is for the app owner.</Body>
        </Screen>
      </>
    );
  }
  if (status.isPending) {
    return (
      <>
        <ScreenHeader title="Testing tools" />
        <LoadingView label="Loading the test kit" />
      </>
    );
  }
  if (status.isError) {
    return (
      <>
        <ScreenHeader title="Testing tools" />
        <Screen>
          <Title>Testing tools</Title>
          <ErrorText>Could not reach the test kit. Check your connection.</ErrorText>
          <Button label="Try again" onPress={() => status.refetch()} />
        </Screen>
      </>
    );
  }

  const s = status.data;
  const busy =
    seed.isPending ||
    fillRoster.isPending ||
    shift.isPending ||
    setRoles.isPending ||
    restart.isPending ||
    reset.isPending;
  const totalObjects = Object.values(s.counts).reduce((sum, n) => sum + n, 0);
  const night = s.next_night;
  const stale = (s.kit_version ?? 0) < EXPECTED_KIT_VERSION;

  // Live only opens an hour before a night starts, so a night further out
  // than that has to be moved before it can be run. Answered by the server,
  // which already knows the time.
  const needsShift = !!night && night.live_open === false;

  /** Do the thing, then open the screen that shows what it did. */
  const lane = (promise: Promise<unknown>, path: string, label: string) => {
    setError(null);
    setMessage(null);
    promise
      .then(() => {
        setMessage(label);
        router.push(path as Parameters<typeof router.push>[0]);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'That action failed. Check your connection and try again.'),
      );
  };

  const run = (label: string, promise: Promise<unknown>) => {
    setError(null);
    setMessage(null);
    promise
      .then(() => setMessage(label))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'That action failed. Check your connection and try again.'),
      );
  };

  /**
   * One lane: build the situation, then walk straight into it. Setting
   * something up and leaving the person to go find it is the step where a
   * test gets abandoned, so there is no gap between the two here. Backing out
   * of wherever this lands returns to this screen.
   */
  const startLane = (scenario: Scenario) => {
    setError(null);
    setMessage(null);
    seed
      .mutateAsync(scenario.key)
      .then((result) => {
        const path = destinationPath(scenario.destination, {
          seriesId: result.series_id,
          occurrenceId: result.occurrence_id,
        });
        if (!path) {
          // Better to say so than to push a screen with nothing in it.
          setError('That scenario did not build what this test needs. Check the test kit version.');
          return;
        }
        setMessage(result.summary);
        router.push(path as Parameters<typeof router.push>[0]);
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

      {/* The one failure that looks like a broken kit but is not. Without
          this, a database missing the newest migrations answers 404 for the
          tools it does not have and 400 for scenario names it has never
          heard of, and the screen looks broken instead of behind. */}
      {stale ? (
        <View style={styles.notice}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.noticeText}>
            This database is running an older test kit (version {s.kit_version ?? 'unknown'}, this
            build expects {EXPECTED_KIT_VERSION}). Newer scenarios and tools will not work until
            the database for this environment is updated to match this build.
          </Text>
        </View>
      ) : null}

      {!s.enabled ? (
        <View style={styles.notice}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.noticeText}>
            The test kit is switched off for this environment. Switch it back on to use it.
          </Text>
          <Button
            label="Switch the test kit on"
            busy={setEnabled.isPending}
            onPress={() => run('Test kit switched on.', setEnabled.mutateAsync(true))}
          />
        </View>
      ) : null}

      {message ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.success}>
          {message}
        </Text>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {/* ----------------------------------------------------------------- */}
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Tests
      </Text>
      <Body>
        Each one builds what it needs and takes you straight into it. Come back with the back arrow
        when you are done.
      </Body>
      {scenarios.map((scenario) => (
        <View key={scenario.key} style={styles.item}>
          {/* The button is the test, not a footnote under a heading that
              repeats it. Everything below is what it builds and what to do
              once you are there. */}
          <Button
            label={scenario.label}
            busy={seed.isPending && seed.variables === scenario.key}
            disabled={busy || !s.enabled}
            onPress={() => startLane(scenario)}
          />
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
            {scenario.detail}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemCaption}>
            Try: {scenario.tryThis}
          </Text>
        </View>
      ))}

      {/* ----------------------------------------------------------------- */}
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Tools
      </Text>
      <Body>
        Not tests, but the adjustments a test needs. Each one acts on the night you last built and
        then opens it, so you can see what it did.
      </Body>
      {night ? (
        <View style={styles.item}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemTitle}>
            {night.title}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
            {new Date(night.starts_at).toLocaleString()} (in your device timezone)
          </Text>

          <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemCaption}>
            Move it and open the mic page, to watch the signup window open and close without waiting
            for the calendar.
          </Text>
          <View style={styles.chipRow}>
            {shiftOffsets.map((minutes) => (
              <Chip
                key={minutes}
                label={shiftLabel(minutes)}
                disabled={busy}
                onPress={() =>
                  lane(
                    shift.mutateAsync({ occurrenceId: night.occurrence_id, minutes }),
                    `/mic/${night.series_id}`,
                    `Moved to ${shiftLabel(minutes)} from now.`,
                  )
                }
              />
            ))}
          </View>

          <Button
            label="Add 3 performers and open the list"
            kind="secondary"
            disabled={busy}
            onPress={() =>
              lane(
                fillRoster.mutateAsync({ occurrenceId: night.occurrence_id, count: 3 }),
                `/producer/night/${night.occurrence_id}`,
                'Added performers to the list.',
              )
            }
          />
          <Button
            label="Rewind it and run it live"
            kind="secondary"
            disabled={busy}
            onPress={() =>
              lane(
                restart
                  .mutateAsync(night.occurrence_id)
                  .then(() =>
                    needsShift
                      ? shift.mutateAsync({ occurrenceId: night.occurrence_id, minutes: 30 })
                      : null,
                  ),
                `/producer/live/${night.occurrence_id}`,
                'Everyone is back on the list and the show is open again.',
              )
            }
          />
        </View>
      ) : (
        <Body>No test nights yet. Run a test above and this fills in.</Body>
      )}

      {/* ----------------------------------------------------------------- */}
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Your roles
      </Text>
      <View style={styles.item}>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
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
            label="Host"
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
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Test sign-ins
      </Text>
      <View style={styles.item}>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
          Every generated account uses the password {s.password}. Sign in as one on a second device
          to watch a roster update live from both sides.
        </Text>
        {s.logins.length === 0 ? (
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemCaption}>
            None yet. Scenarios create them as they need them.
          </Text>
        ) : (
          s.logins.map((login) => (
            <Text maxFontSizeMultiplier={maxFontScale} key={login.email} style={styles.itemCaption}>
              {login.name}: {login.email}
            </Text>
          ))
        )}
      </View>

      {/* ----------------------------------------------------------------- */}
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Clean up
      </Text>
      <View style={styles.item}>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
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
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.itemBody}>
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
      <Text
        maxFontSizeMultiplier={maxFontScale}
        style={[styles.chipLabel, active && { color: accent }]}
      >
        {label}
      </Text>
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
    minHeight: minTouchTarget,
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
    borderRadius: radius.md,
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
