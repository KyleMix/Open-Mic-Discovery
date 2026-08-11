import { Stack } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';

import { palette } from '@/theme';

export default function AuthLayout() {
  const reduceMotion = useReducedMotion();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.text,
        contentStyle: { backgroundColor: palette.bg },
        animation: reduceMotion ? 'fade' : 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
      <Stack.Screen
        name="reset-password"
        options={{ title: 'New password', headerBackVisible: false }}
      />
      <Stack.Screen name="eula" options={{ title: 'Terms of use', headerBackVisible: false }} />
      <Stack.Screen
        name="onboarding"
        options={{ title: 'Set up your profile', headerBackVisible: false }}
      />
    </Stack>
  );
}
