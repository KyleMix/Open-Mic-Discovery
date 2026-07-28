import { useState } from 'react';

import { signUpWithEmail } from '@/features/auth/api';
import { validateEmail, validatePassword } from '@/features/auth/validation';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string | null;
    password?: string | null;
  }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await signUpWithEmail(email.trim(), password);
      // The root gate routes new sessions to the EULA and onboarding.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
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
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Create account" busy={busy} disabled={busy} onPress={submit} />
    </Screen>
  );
}
