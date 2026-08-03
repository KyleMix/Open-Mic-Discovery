import { useRouter } from 'expo-router';
import { useState } from 'react';

import { requestPasswordReset } from '@/features/auth/api';
import { validateEmail } from '@/features/auth/validation';
import { Body, Button, ErrorText, Field, FormScreen, Screen, Title } from '@/components/ui';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    const emailError = validateEmail(email);
    setFieldError(emailError);
    if (emailError) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the reset email.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <Title>Check your email</Title>
        <Body>
          If an account exists for {email.trim()}, a reset link is on its way. Open it on this
          device and it brings you back here to set a new password.
        </Body>
        <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </Screen>
    );
  }

  return (
    <FormScreen>
      <Title>Reset your password</Title>
      <Body>Enter your email and we send a link that lets you set a new one.</Body>
      <Field
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setFieldError(null);
        }}
        onBlur={() => setFieldError(email ? validateEmail(email) : null)}
        error={fieldError}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Send reset link" busy={busy} disabled={busy || !email} onPress={submit} />
    </FormScreen>
  );
}
