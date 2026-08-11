import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { signInWithApple, signInWithEmail, signInWithGoogle } from '@/features/auth/api';
import { validateEmail } from '@/features/auth/validation';
import { Logo } from '@/components/logo';
import { Body, Button, ErrorText, Field, FormScreen } from '@/components/ui';
import { maxFontScale, minTouchTarget, palette, spacing } from '@/theme';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'email' | 'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'email' | 'apple' | 'google', action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      // Navigation happens in the root gate once the session lands.
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign in failed. Try again.';
      // Backing out of the Apple or Google sheet is a choice, not a failure;
      // showing it in red reads as something going wrong.
      if (!message.toLowerCase().includes('cancel')) {
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <FormScreen>
      <View style={{ alignItems: 'center', marginVertical: spacing.lg }}>
        <Logo markSize={48} />
      </View>
      <Body>Find a mic. Get on the list.</Body>
      <Field
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
        inputMode="email"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setEmailError(null);
        }}
        onBlur={() => setEmailError(email ? validateEmail(email) : null)}
        error={emailError}
      />
      <Field
        label="Password"
        autoComplete="current-password"
        textContentType="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {/* asChild puts the touch box on a Pressable sized to the minimum
          target; the bare Link was only as tall as its text. */}
      <Link href="/(auth)/forgot-password" asChild>
        <Pressable
          accessibilityRole="link"
          style={({ pressed }) => [
            {
              alignSelf: 'flex-start',
              justifyContent: 'center',
              minHeight: minTouchTarget,
            },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text maxFontSizeMultiplier={maxFontScale} style={{ color: palette.textSecondary }}>
            Forgot password?
          </Text>
        </Pressable>
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
      {/* New users arrive here from every commitment CTA, so the way to an
          account is a full button, not a text link to hunt for. */}
      <Button
        label="New here? Create an account"
        kind="secondary"
        disabled={busy !== null}
        onPress={() => router.push('/(auth)/sign-up')}
      />
      <Button
        label="Browse mics without an account"
        kind="secondary"
        disabled={busy !== null}
        onPress={() => router.replace('/(tabs)')}
      />
    </FormScreen>
  );
}
