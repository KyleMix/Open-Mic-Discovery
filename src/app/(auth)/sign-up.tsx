import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { signInWithApple, signInWithGoogle, signUpWithEmail } from '@/features/auth/api';
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
  const [busy, setBusy] = useState<'email' | 'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function submit() {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    setFieldErrors({ email: emailError, password: passwordError });
    if (emailError || passwordError) {
      return;
    }
    setBusy('email');
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
      setBusy(null);
    }
  }

  // Apple and Google create the account on first use, so the buttons belong
  // on this screen as much as on sign-in; new users used to only find them
  // by backing out to the password form.
  async function runProvider(kind: 'apple' | 'google', action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      // Navigation happens in the root gate once the session lands.
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign up failed. Try again.';
      // Backing out of the provider sheet is a choice, not a failure.
      if (!message.toLowerCase().includes('cancel')) {
        setError(message);
      }
    } finally {
      setBusy(null);
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
        textContentType="username"
        inputMode="email"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setFieldErrors((e) => ({ ...e, email: null }));
        }}
        onBlur={() => setFieldErrors((e) => ({ ...e, email: validateEmail(email) }))}
        error={fieldErrors.email}
      />
      <Field
        label="Password"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setFieldErrors((e) => ({ ...e, password: null }));
        }}
        onBlur={() => setFieldErrors((e) => ({ ...e, password: validatePassword(password) }))}
        error={fieldErrors.password}
      />
      <Body>Passwords are at least 10 characters.</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Create account"
        busy={busy === 'email'}
        disabled={busy !== null}
        onPress={submit}
      />
      {Platform.OS === 'ios' ? (
        <Button
          label="Continue with Apple"
          kind="secondary"
          busy={busy === 'apple'}
          disabled={busy !== null}
          onPress={() => runProvider('apple', signInWithApple)}
        />
      ) : null}
      <Button
        label="Continue with Google"
        kind="secondary"
        busy={busy === 'google'}
        disabled={busy !== null}
        onPress={() => runProvider('google', signInWithGoogle)}
      />
      <Button
        label="I already have an account"
        kind="secondary"
        disabled={busy !== null}
        onPress={() => router.push('/(auth)/sign-in')}
      />
      <Body>
        You will review and accept the terms of use next. Curious how your data is handled?
      </Body>
      <Button
        label="Read the privacy policy"
        kind="secondary"
        onPress={() => router.push('/privacy')}
      />
    </FormScreen>
  );
}
