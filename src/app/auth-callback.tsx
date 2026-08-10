import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { ScreenHeader } from '@/components/screen-header';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { exchangeAuthCode } from '@/features/auth/api';
import { consumeReturnTo } from '@/stores/return-to';

/**
 * Where the email confirmation link lands.
 *
 * The link used to point at the project site URL, a dead loopback address:
 * a brand-new user's very first tap outside the app went nowhere, and the
 * in-app screen told them to come back and type their password again. This
 * route exchanges the link's one-time code for a session; the root gate
 * then walks the new account through the EULA and onboarding, back to
 * wherever they were headed.
 */
export default function AuthCallbackScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  // A link with no code is knowable at render time; only the exchange
  // outcome needs state.
  const error = code
    ? exchangeError
    : 'That link is incomplete. Open the newest email and tap the link again.';

  useEffect(() => {
    if (!code) {
      return;
    }
    let cancelled = false;
    exchangeAuthCode(code)
      .then(() => {
        // Navigate here, not in the gate: this route sits outside the
        // (auth) group, so the gate's final bounce never fires for it and
        // an already-onboarded account (reinstall, second device) would sit
        // on "Confirming your email" forever. A brand-new account passes
        // through the tabs for one frame and the gate walks it into the
        // EULA and onboarding from there, recording the destination.
        if (!cancelled) {
          const returnTo = consumeReturnTo();
          router.replace((returnTo ?? '/(tabs)') as Parameters<typeof router.replace>[0]);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setExchangeError(e instanceof Error ? e.message : 'That link did not work.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  if (error) {
    return (
      <>
        <ScreenHeader title="Confirm your email" />
        <Screen>
          <Title>Confirm your email</Title>
          <ErrorText>{error}</ErrorText>
          <Body>Signing in with your email and password also finishes confirmation.</Body>
          <Button label="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
        </Screen>
      </>
    );
  }
  return (
    <>
      <ScreenHeader title="Confirm your email" />
      <LoadingView label="Confirming your email" />
    </>
  );
}
