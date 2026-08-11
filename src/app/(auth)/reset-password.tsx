import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { exchangeRecoveryCode, updatePassword } from '@/features/auth/api';
import { useSession } from '@/features/auth/session';
import { validatePassword } from '@/features/auth/validation';
import { Body, Button, ErrorText, Field, FormScreen, LoadingView, Screen, Title } from '@/components/ui';

/**
 * Landing screen for the emailed reset link. The link carries a one-time
 * code; exchanging it signs the person in with a recovery session, and the
 * form here sets the new password. The auth gate leaves this screen alone
 * so the recovery session is not bounced into the app mid-reset.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session, ready } = useSession();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const code = typeof params.code === 'string' ? params.code : undefined;
  const linkError =
    typeof params.error_description === 'string' ? params.error_description : undefined;

  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!ready || session || !code) {
      return;
    }
    let cancelled = false;
    exchangeRecoveryCode(code).catch((e) => {
      if (!cancelled) {
        setExchangeError(e instanceof Error ? e.message : 'Could not open the reset link.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, session, code]);

  // Waiting on the exchange is derived: a code with no session and no error
  // means it is still in flight (success lands as a session change).
  const exchanging = ready && !session && !!code && !exchangeError && !linkError;

  async function submit() {
    const passwordError =
      validatePassword(password) ?? (password !== confirm ? 'Passwords do not match.' : null);
    setFieldError(passwordError);
    if (passwordError) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the password.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready || exchanging) {
    return <LoadingView label="Opening your reset link" />;
  }

  if (done) {
    return (
      <Screen>
        <Title>Password updated</Title>
        <Body>You are signed in with your new password.</Body>
        <Button label="Continue" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <Title>Reset link problem</Title>
        <Body>
          {exchangeError ??
            linkError ??
            'This reset link is incomplete, expired, or was requested on another device.'}
        </Body>
        <Button
          label="Request a new link"
          onPress={() => router.replace('/(auth)/forgot-password')}
        />
        <Button
          label="Back to sign in"
          kind="secondary"
          onPress={() => router.replace('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <FormScreen>
      <Title>Set a new password</Title>
      <Field
        label="New password"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setFieldError(null);
        }}
        onBlur={() => setFieldError(validatePassword(password))}
        error={fieldError}
      />
      <Field
        label="Type it again"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          setFieldError(null);
        }}
        onBlur={() =>
          setFieldError(confirm && password !== confirm ? 'Passwords do not match.' : null)
        }
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Save new password" busy={busy} disabled={busy} onPress={submit} />
    </FormScreen>
  );
}
