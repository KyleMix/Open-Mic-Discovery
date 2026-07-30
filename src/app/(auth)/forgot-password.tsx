import { useRouter } from 'expo-router';
import { useState } from 'react';

import { sendPasswordReset } from '@/features/auth/api';
import { validateEmail } from '@/features/auth/validation';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';

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
      await sendPasswordReset(email);
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
          If an account exists for {email.trim()}, a reset link is on its way. Open the link on
          this device: it brings you back here to set a new password.
        </Body>
        <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
        <Button label="Send it again" kind="secondary" busy={busy} onPress={submit} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Reset your password</Title>
      <Body>Enter the email you signed up with and we will send a reset link.</Body>
      <Field
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChangeText={setEmail}
        error={fieldError}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Send reset link" busy={busy} disabled={busy || !email} onPress={submit} />
    </Screen>
  );
}
