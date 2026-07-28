import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';

import { Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { SessionProvider, useSession } from '@/features/auth/session';
import { useLatestEula, useOwnProfile } from '@/features/auth/queries';
import { queryClient } from '@/lib/query-client';
import { palette } from '@/theme';

const appTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: palette.bg,
    card: palette.bgElevated,
    text: palette.text,
    border: palette.border,
  },
};

/**
 * Routes by auth state:
 *   no session                -> sign-in / sign-up
 *   session, no profile      -> EULA gate, then onboarding
 *   profile on old EULA      -> EULA gate (re-accept)
 *   fully onboarded          -> the app
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { session, ready } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const eula = useLatestEula();
  // Typed routes narrow segments per-route; we branch across groups, so
  // widen to a plain string array.
  const segments: string[] = useSegments();
  const router = useRouter();

  const inAuthGroup = segments[0] === '(auth)';
  const authScreen = inAuthGroup ? segments[1] : undefined;
  const waiting = !ready || (session != null && (profile.isPending || eula.isPending));

  useEffect(() => {
    if (waiting || profile.isError || eula.isError) {
      return;
    }
    if (!session) {
      if (!inAuthGroup || authScreen === 'eula' || authScreen === 'onboarding') {
        router.replace('/(auth)/sign-in');
      }
      return;
    }
    if (!profile.data) {
      if (authScreen !== 'eula' && authScreen !== 'onboarding') {
        router.replace('/(auth)/eula');
      }
      return;
    }
    if (eula.data && profile.data.eula_version !== eula.data.version) {
      if (authScreen !== 'eula') {
        router.replace('/(auth)/eula');
      }
      return;
    }
    if (inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [
    waiting,
    session,
    profile.data,
    profile.isError,
    eula.data,
    eula.isError,
    inAuthGroup,
    authScreen,
    router,
  ]);

  if (waiting) {
    return <LoadingView label="Getting things ready" />;
  }
  if (session && (profile.isError || eula.isError)) {
    return (
      <Screen>
        <Title>Connection trouble</Title>
        <ErrorText>Could not load your account. Check your connection.</ErrorText>
        <Button
          label="Try again"
          onPress={() => {
            profile.refetch();
            eula.refetch();
          }}
        />
      </Screen>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  // Brand typography; screens render with the system font until loaded.
  useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ThemeProvider value={appTheme}>
          <StatusBar style="light" />
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)" />
            </Stack>
          </AuthGate>
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
