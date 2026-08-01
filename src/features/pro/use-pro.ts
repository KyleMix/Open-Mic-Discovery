import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';

import { useTestOverridesStore } from '@/stores/test-overrides';
import { resolveProStatus, type ProStatus } from './status';

export const PRO_ENTITLEMENT = 'producer_pro';

const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

let configured = false;

function ensureConfigured(userId: string): boolean {
  if (!apiKey) {
    return false;
  }
  if (!configured) {
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
  }
  return true;
}

export type ProState = {
  status: ProStatus;
  entitled: boolean;
  /** The monthly package to present on the paywall, when configured. */
  monthly: PurchasesPackage | null;
};

export function useProStatus(userId: string | undefined) {
  // Testing tools can force either side of the gate. Part of the query key
  // so flipping it re-resolves immediately instead of on the next refetch.
  const override = useTestOverridesStore((s) => s.proOverride);
  return useQuery({
    queryKey: ['pro', userId, override],
    enabled: !!userId,
    queryFn: async (): Promise<ProState> => {
      const isConfigured = ensureConfigured(userId!);
      if (!isConfigured) {
        const resolved = resolveProStatus(false, __DEV__, false, override);
        return { ...resolved, monthly: null };
      }
      try {
        const [info, offerings] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);
        const entitled = !!info.entitlements.active[PRO_ENTITLEMENT];
        const resolved = resolveProStatus(true, __DEV__, entitled, override);
        return { ...resolved, monthly: offerings.current?.monthly ?? null };
      } catch {
        // Native module unavailable (Expo Go) behaves like unconfigured.
        const resolved = resolveProStatus(false, __DEV__, false, override);
        return { ...resolved, monthly: null };
      }
    },
  });
}

export function usePurchaseActions(userId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pro', userId] });

  return {
    purchase: async (pkg: PurchasesPackage) => {
      await Purchases.purchasePackage(pkg);
      invalidate();
    },
    restore: async () => {
      const info = await Purchases.restorePurchases();
      invalidate();
      return !!info.entitlements.active[PRO_ENTITLEMENT];
    },
  };
}
