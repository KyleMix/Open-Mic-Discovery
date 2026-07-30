import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { LoadingView } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { PaywallView } from '@/features/pro/components/paywall-view';
import { openLegalLink } from '@/features/pro/legal';
import { usePurchaseActions, useProStatus } from '@/features/pro/use-pro';
import { palette, spacing } from '@/theme';

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

  async function openLegal(url: string) {
    setError(null);
    const failure = await openLegalLink(url);
    if (failure) {
      setError(failure);
    }
  }

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
      <PaywallView
        state={pro.data}
        busy={busy}
        error={error}
        restored={restored}
        onPurchase={(pkg: PurchasesPackage) => run('purchase', () => actions.purchase(pkg))}
        onRestore={() => run('restore', actions.restore)}
        onOpenLegal={openLegal}
        onBack={() => router.back()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
