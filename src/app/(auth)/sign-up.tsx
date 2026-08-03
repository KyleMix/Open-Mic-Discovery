import { useRouter } from 'expo-router';
import { useState } from 'react';

import { signUpWithEmail } from '@/features/auth/api';
import { validateEmail, validatePassword } from '@/features/auth/validation';
import { Body, Button, ErrorText, Field, FormScreen, Screen, Title } from '@/components/ui';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string | null;
    password?: string | null;
  }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function submit() {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    setFieldErrors({ email: emailError, password: passwordError });
    if (emailError || passwordError) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { needsEmailConfirmation } = await signUpWithEmail(email.trim(), password);
      if (needsEmailConfirmation) {
        setAwaitingConfirmation(true);
      }
      // Otherwise the root gate routes the new session to the EULA and onboarding.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <Screen>
        <Title>Check your email</Title>
        <Body>
          We sent a confirmation link to {email.trim()}. Open it, then come back and sign in.
        </Body>
        <Button label="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </Screen>
    );
  }

  return (
    <FormScreen>
      <Title>Create your account</Title>
      <Body>
        One account covers both sides of the mic: performing, producing, or both. You pick your
        roles next.
      </Body>
      <Field
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
      />
      <Field
        label="Password"
        autoComplete="new-password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
      />
      <Body>Passwords are at least 10 characters.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Create account" busy={busy} disabled={busy} onPress={submit} />
    </FormScreen>
  );
}
