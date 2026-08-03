import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { exchangeRecoveryCode, updatePassword } from '@/features/auth/api';
import { useSession } from '@/features/auth/session';
import { validatePassword } from '@/features/auth/validation';
import { Body, Button, ErrorText, Field, LoadingView, Screen, Title } from '@/components/ui';

/**
 * Landing screen for the password-reset email link. The link carries a
 * one-time code; exchanging it signs the person in just enough to set a
 * new password. Without a valid code (opened by hand, or an expired link)
 * the screen says so instead of dead-ending.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [exchange, setExchange] = useState<'working' | 'done' | 'failed'>(
    code ? 'working' : 'failed',
  );
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!code) {
      return;
    }
    exchangeRecoveryCode(code)
      .then(() => mounted && setExchange('done'))
      .catch((e) => {
        if (mounted) {
          setExchange('failed');
          setExchangeError(e instanceof Error ? e.message : null);
        }
      });
    return () => {
      mounted = false;
    };
  }, [code]);

  async function submit() {
    const passwordError = validatePassword(password);
    setFieldError(passwordError);
    if (passwordError) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the password.');
    } finally {
      setBusy(false);
    }
  }

  if (exchange === 'working') {
    return <LoadingView label="Checking your reset link" />;
  }
  // A session from the exchange (or an already signed-in user changing
  // their password through a reset link) can proceed; otherwise the link
  // did not check out.
  if (exchange === 'failed' && !session) {
    return (
      <Screen>
        <Title>Reset link problem</Title>
        <Body>
          {exchangeError ??
            'This screen only works from the link in a password reset email. Request a new one and open it on this device.'}
        </Body>
        <Button
          label="Request a new link"
          onPress={() => router.replace('/(auth)/forgot-password')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Set a new password</Title>
      <Field
        label="New password"
        autoComplete="new-password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        error={fieldError}
      />
      <Body>Passwords are at least 10 characters.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Save new password" busy={busy} disabled={busy || !password} onPress={submit} />
    </Screen>
  );
}
