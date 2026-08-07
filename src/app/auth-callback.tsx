import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { ScreenHeader } from '@/components/screen-header';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { exchangeAuthCode } from '@/features/auth/api';

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
    exchangeAuthCode(code).catch((e) => {
      if (!cancelled) {
        setExchangeError(e instanceof Error ? e.message : 'That link did not work.');
      }
    });
    // Success needs no navigation here: the session lands and the root
    // gate routes to the EULA, onboarding, or the recorded destination.
    return () => {
      cancelled = true;
    };
  }, [code]);

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
