import type { PurchasesPackage } from 'react-native-purchases';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText, Title } from '@/components/ui';
import { LEGAL_LINKS } from '@/features/pro/legal';
import type { ProState } from '@/features/pro/use-pro';
import { fonts, palette, spacing, type } from '@/theme';

const FEATURES = [
  'Signup list management: lottery draws, running order, waitlist promotion',
  'Performed and no-show tracking for every night',
  'Listing analytics: signups and turnout per night',
  'Realtime list updates on stage-side devices',
];

export type PaywallViewProps = {
  state: ProState | undefined;
  busy: 'purchase' | 'restore' | null;
  error: string | null;
  restored: boolean | null;
  onPurchase: (pkg: PurchasesPackage) => void;
  onRestore: () => void;
  onOpenLegal: (url: string) => void;
  onBack: () => void;
};

/**
 * The rendered paywall. Everything Apple 3.1.2 requires lives inside the
 * binary: the subscription title, the billing period, the price as the most
 * prominent pricing element, tappable Privacy Policy and Terms of Use links
 * (in-app browser), and Restore Purchases.
 */
export function PaywallView({
  state,
  busy,
  error,
  restored,
  onPurchase,
  onRestore,
  onOpenLegal,
  onBack,
}: PaywallViewProps) {
  const monthly = state?.monthly ?? null;
  return (
    <View style={styles.container}>
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
          <Button label="Back to your mics" onPress={onBack} />
        </>
      ) : (
        <>
          {monthly ? (
            <View style={styles.priceCard}>
              <Text style={styles.subscriptionTitle}>Producer Pro Monthly</Text>
              <View style={styles.priceRow}>
                <Text accessibilityLabel={`Price ${monthly.product.priceString} per month`}>
                  <Text style={styles.price}>{monthly.product.priceString}</Text>
                  <Text style={styles.priceUnit}> / month</Text>
                </Text>
              </View>
              <Text style={styles.billingPeriod}>
                Monthly subscription. Renews automatically every month until cancelled.
              </Text>
              <Button
                label="Subscribe"
                busy={busy === 'purchase'}
                onPress={() => onPurchase(monthly)}
              />
            </View>
          ) : (
            <Body>
              Subscriptions are not available in this build. In TestFlight and production builds
              the monthly price appears here.
            </Body>
          )}
          <Button
            label="Restore Purchases"
            kind="secondary"
            busy={busy === 'restore'}
            onPress={onRestore}
          />
          {restored === true && !state?.entitled ? (
            <Body>No previous purchase found for this account.</Body>
          ) : null}
        </>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Text style={styles.finePrint}>
        Payment is charged to your app store account. Subscriptions renew monthly until cancelled
        in your store settings. Some mics charge performers for reserved slots; those payments
        happen at the venue or through the producer, never inside this app.
      </Text>
      <View style={styles.legalRow}>
        {[LEGAL_LINKS.privacyPolicy, LEGAL_LINKS.termsOfUse].map((link) => (
          <Pressable
            key={link.url}
            accessibilityRole="link"
            accessibilityLabel={link.label}
            hitSlop={8}
            onPress={() => onOpenLegal(link.url)}
          >
            <Text style={styles.legalLink}>{link.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
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
  priceCard: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  subscriptionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  priceRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
  },
  // The price is deliberately the largest text on the screen (Apple 3.1.2:
  // the price must be the most prominent pricing element).
  price: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: 40,
    lineHeight: 46,
  },
  priceUnit: {
    color: palette.textSecondary,
    fontSize: type.heading.fontSize,
  },
  billingPeriod: {
    color: palette.textSecondary,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  finePrint: {
    color: palette.textDisabled,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
  },
  legalRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  legalLink: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    textDecorationLine: 'underline',
  },
});
