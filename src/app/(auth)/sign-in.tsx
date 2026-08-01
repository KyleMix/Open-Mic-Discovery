import { Link } from 'expo-router';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { signInWithApple, signInWithEmail, signInWithGoogle } from '@/features/auth/api';
import { Logo } from '@/components/logo';
import { Body, Button, ErrorText, Field, Screen } from '@/components/ui';
import { palette, spacing } from '@/theme';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'email' | 'apple' | 'google', action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      // Navigation happens in the root gate once the session lands.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginVertical: spacing.lg }}>
        <Logo markSize={48} />
      </View>
      <Body>Find a mic. Get on the list.</Body>
      <Field
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChangeText={setEmail}
      />
      <Field
        label="Password"
        autoComplete="current-password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Link href="/(auth)/forgot-password">
        <Text style={{ color: palette.textSecondary }}>Forgot password?</Text>
      </Link>
      <Button
        label="Sign in"
        busy={busy === 'email'}
        disabled={busy !== null || !email || !password}
        onPress={() => run('email', () => signInWithEmail(email.trim(), password))}
      />
      {Platform.OS === 'ios' ? (
        <Button
          label="Continue with Apple"
          kind="secondary"
          busy={busy === 'apple'}
          disabled={busy !== null}
          onPress={() => run('apple', signInWithApple)}
        />
      ) : null}
      <Button
        label="Continue with Google"
        kind="secondary"
        busy={busy === 'google'}
        disabled={busy !== null}
        onPress={() => run('google', signInWithGoogle)}
      />
      <View style={{ marginTop: spacing.md }}>
        <Link href="/(auth)/sign-up">
          <Text style={{ color: palette.text }}>New here? Create an account</Text>
        </Link>
      </View>
    </Screen>
  );
}
