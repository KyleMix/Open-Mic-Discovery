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
  usePathname,
  useRouter,
  useSegments,
  type ErrorBoundaryProps,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';

import { OfflineBanner } from '@/components/offline-banner';
import { ToastProvider } from '@/components/toast';
import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { SessionProvider, useSession } from '@/features/auth/session';
import { SanctionBanner } from '@/features/safety/components/sanction-banner';
import { useLatestEulaVersion, useOwnProfile } from '@/features/auth/queries';
import { observeNotificationTaps, registerPushToken } from '@/lib/notifications';
import { CACHE_BUSTER, queryClient, queryPersister } from '@/lib/query-client';
import { initSentry, reportError } from '@/lib/sentry';
import { consumeReturnTo, setReturnTo } from '@/stores/return-to';
import { palette } from '@/theme';

// A cold-start deep link (a shared mic, a push tap) renders on top of the
// tabs instead of as the only screen on the stack. Without an anchor the
// linked page had no back button and no tab bar: the app's front door led
// into a room with no doors.
export const unstable_settings = { anchor: '(tabs)' };

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
  const eula = useLatestEulaVersion();
  // Typed routes narrow segments per-route; we branch across groups, so
  // widen to a plain string array.
  const segments: string[] = useSegments();
  const pathname = usePathname();
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
    if (waiting) {
      return;
    }
    // An error with cached data still routes: the cache knows whether this
    // account is onboarded, and blocking on a failed refetch locked the
    // whole app behind a connection screen in exactly the offline moments
    // the persisted cache exists for. Only an unknown profile blocks; an
    // unknown EULA version skips the version check until it can run.
    if (session && profile.isError && profile.data === undefined) {
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
      // reset-password is exempt here and below for the same reason as the
      // final branch: yanking the recovery session into the EULA funnel
      // left the password silently unchanged.
      if (
        topSegment !== 'privacy' &&
        authScreen !== 'eula' &&
        authScreen !== 'onboarding' &&
        authScreen !== 'reset-password'
      ) {
        // A shared link opened mid-funnel (a mic page, say) is a
        // destination, not a detour: record it so finishing setup lands
        // there instead of losing it.
        if (!inAuthGroup) {
          setReturnTo(pathname);
        }
        router.replace('/(auth)/eula');
      }
      return;
    }
    if (eula.data && profile.data.eula_version !== eula.data.version) {
      if (topSegment !== 'privacy' && authScreen !== 'eula' && authScreen !== 'reset-password') {
        if (!inAuthGroup) {
          setReturnTo(pathname);
        }
        router.replace('/(auth)/eula');
      }
      return;
    }
    // reset-password keeps its recovery session on screen until the new
    // password is saved; every other auth screen bounces into the app, back
    // to wherever the person was headed when the funnel interrupted them.
    if (inAuthGroup && authScreen !== 'reset-password') {
      const returnTo = consumeReturnTo();
      const target = (returnTo ?? '/(tabs)') as Parameters<typeof router.replace>[0];
      // dismissTo pops the funnel screens off the stack on the way to the
      // destination; a plain replace left the destination duplicated
      // beneath itself (mic page, sign-in pushed on top, replaced by the
      // mic page again).
      try {
        router.dismissTo(target);
      } catch {
        router.replace(target);
      }
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
    pathname,
    router,
  ]);

  if (waiting) {
    return <LoadingView label="Getting things ready" />;
  }
  // Blocking the whole tree is a last resort for "no idea who this is":
  // signed in, profile fetch failed, and nothing cached. With cached data
  // the app renders and the offline banner says why things may be stale.
  if (session && profile.isError && profile.data === undefined) {
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
      persistOptions={{
        persister: queryPersister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: CACHE_BUSTER,
      }}
    >
      <SessionProvider>
        <ThemeProvider value={appTheme}>
          <StatusBar style="light" />
          <ToastProvider>
            <OfflineBanner />
            <SanctionBanner />
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
