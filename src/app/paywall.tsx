import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Body, Button, ErrorText, LoadingView, Title } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { usePurchaseActions, useProStatus } from '@/features/pro/use-pro';
import { fonts, palette, spacing, type } from '@/theme';

const FEATURES = [
  'Signup list management: lottery draws, running order, waitlist promotion',
  'Performed and no-show tracking for every night',
  'Listing analytics: signups and turnout per night',
  'Realtime list updates on stage-side devices',
];

export default function PaywallScreen() {
  const router = useRouter();
  const { session } = useSession();
  const pro = useProStatus(session?.user.id);
  const actions = usePurchaseActions(session?.user.id);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<boolean | null>(null);

  if (pro.isPending) {
    return <LoadingView label="Loading Producer Pro" />;
  }

  async function run(kind: 'purchase' | 'restore', action: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      if (kind === 'restore') {
        setRestored(true);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      if (!message.toLowerCase().includes('cancel')) {
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  }

  const state = pro.data;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Producer Pro',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />
      <Title>Producer Pro</Title>
      <Body>
        Discovering mics and performing is free, forever. Producer Pro funds the platform and
        unlocks the tools for running the night.
      </Body>
      {FEATURES.map((f) => (
        <Text key={f} style={styles.feature}>
          {'•'} {f}
        </Text>
      ))}
      <Body>
        Listing your mic, confirming it is accurate, and cancelling nights stay free for every
        producer: fresh listings are the whole point.
      </Body>

      {state?.entitled ? (
        <>
          <Text style={styles.entitled}>Producer Pro is active on this account.</Text>
          {state.status === 'unconfigured' ? (
            <Body>
              Development build note: purchases are not configured, so Pro is unlocked for testing.
            </Body>
          ) : null}
          <Button label="Back to your mics" onPress={() => router.back()} />
        </>
      ) : (
        <>
          {state?.monthly ? (
            <Button
              label={`Subscribe: ${state.monthly.product.priceString} per month`}
              busy={busy === 'purchase'}
              onPress={() => run('purchase', () => actions.purchase(state.monthly!))}
            />
          ) : (
            <Body>
              Subscriptions are not available in this build. In TestFlight and production builds the
              monthly price appears here.
            </Body>
          )}
          <Button
            label="Restore Purchases"
            kind="secondary"
            busy={busy === 'restore'}
            onPress={() => run('restore', actions.restore)}
          />
          {restored === true && !state?.entitled ? (
            <Body>No previous purchase found for this account.</Body>
          ) : null}
        </>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Text style={styles.finePrint}>
        Payment is charged to your app store account. Subscriptions renew monthly until cancelled in
        your store settings. Some mics charge performers for reserved slots; those payments happen
        at the venue or through the producer, never inside this app.
      </Text>
    </ScrollView>
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
  feature: {
    color: palette.text,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  entitled: {
    color: palette.success,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  finePrint: {
    color: palette.textDisabled,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
  },
});
