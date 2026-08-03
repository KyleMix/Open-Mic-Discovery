import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  useFonts,
} from '@expo-google-fonts/poppins';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';

import { Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { SessionProvider, useSession } from '@/features/auth/session';
import { useLatestEula, useOwnProfile } from '@/features/auth/queries';
import { observeNotificationTaps, registerPushToken } from '@/lib/notifications';
import { queryClient } from '@/lib/query-client';
import { initSentry } from '@/lib/sentry';
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
 *   no session                -> browse Discover and listings as a guest;
 *                                everything else routes to sign-in
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

  const topSegment = segments[0];
  const inAuthGroup = topSegment === '(auth)';
  const authScreen = inAuthGroup ? segments[1] : undefined;
  const waiting = !ready || (session != null && (profile.isPending || eula.isPending));

  // Push registration is quiet and best-effort; the userId is stable per session.
  useEffect(() => {
    if (session?.user.id) {
      registerPushToken(session.user.id);
    }
  }, [session?.user.id]);

  // Tapping a push opens the mic it is about instead of the last screen.
  useEffect(() => {
    return observeNotificationTaps((path) => {
      router.push(path as Parameters<typeof router.push>[0]);
    });
  }, [router]);

  useEffect(() => {
    if (waiting || profile.isError || eula.isError) {
      return;
    }
    if (!session) {
      // Discovery is the wedge: guests can browse the tabs and open listings.
      // Actions that need an account (favorite, sign up, flag, claim, report)
      // prompt for sign-in where they happen.
      const inGuestArea = topSegment === '(tabs)' || topSegment === 'mic';
      if (!inGuestArea && (!inAuthGroup || authScreen === 'eula' || authScreen === 'onboarding')) {
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
    if (inAuthGroup && authScreen !== 'reset-password') {
      // The reset screen holds a fresh recovery session on purpose; yanking
      // the person into the tabs before they set a new password breaks it.
      router.replace('/(tabs)');
    }
  }, [
    waiting,
    session,
    profile.data,
    profile.isError,
    eula.data,
    eula.isError,
    topSegment,
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

// Cached server data survives restarts so listings stay readable offline
// (performers check this app in parking lots with one bar of signal).
const persister = createAsyncStoragePersister({ storage: AsyncStorage });

initSentry();

export default function RootLayout() {
  // Brand typography; screens render with the system font until loaded.
  useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
    >
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
    </PersistQueryClientProvider>
  );
}
