import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  DarkTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
  type ErrorBoundaryProps,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';

import { ToastProvider } from '@/components/toast';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { SessionProvider, useSession } from '@/features/auth/session';
import { useLatestEula, useOwnProfile } from '@/features/auth/queries';
import { observeNotificationTaps, registerPushToken } from '@/lib/notifications';
import { CACHE_BUSTER, queryClient, queryPersister } from '@/lib/query-client';
import { initSentry, reportError } from '@/lib/sentry';
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
      // Browsing is open. Discovery, search, and mic pages all read fine
      // signed out, and the account is pitched where it actually pays off
      // (getting on a list, favorites, running a mic) rather than at the door.
      // Only the two screens that assume a session bounce back out.
      if (authScreen === 'eula' || authScreen === 'onboarding') {
        router.replace('/(tabs)');
      }
      return;
    }
    if (!profile.data) {
      if (topSegment !== 'privacy' && authScreen !== 'eula' && authScreen !== 'onboarding') {
        router.replace('/(auth)/eula');
      }
      return;
    }
    if (eula.data && profile.data.eula_version !== eula.data.version) {
      if (topSegment !== 'privacy' && authScreen !== 'eula') {
        router.replace('/(auth)/eula');
      }
      return;
    }
    // reset-password keeps its recovery session on screen until the new
    // password is saved; every other auth screen bounces into the app.
    if (inAuthGroup && authScreen !== 'reset-password') {
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

initSentry();

/**
 * Last line of defense (Guideline 2.1: no crash paths).
 *
 * Expo Router renders this instead of the tree when a render or an effect
 * throws anywhere below the root. Retry remounts the segment, so a transient
 * failure (a realtime channel, a bad response) costs a tap rather than a
 * relaunch. The message is shown because the person seeing it is usually the
 * one who can report it.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <Screen>
      <Title>Something went wrong</Title>
      <Body>
        That screen could not load. Trying again usually fixes it. If it keeps happening, the
        details below are worth sending on.
      </Body>
      <ErrorText>{error.message}</ErrorText>
      <Button label="Try again" onPress={() => retry()} />
    </Screen>
  );
}

export default function RootLayout() {
  // Brand typography; screens render with the system font until loaded.
  useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000, buster: CACHE_BUSTER }}
    >
      <SessionProvider>
        <ThemeProvider value={appTheme}>
          <StatusBar style="light" />
          <ToastProvider>
            <AuthGate>
              <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" />
              </Stack>
            </AuthGate>
          </ToastProvider>
        </ThemeProvider>
      </SessionProvider>
    </PersistQueryClientProvider>
  );
}
