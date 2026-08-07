import { Stack } from 'expo-router';

import { palette } from '@/theme';

/**
 * The header for stack screens, rendered in every state.
 *
 * The root stack hides headers by default, so a loading or error branch
 * that returns before the screen's own Stack.Screen mounts renders with no
 * header at all: no title and, on iOS, no back button. Rendering this first
 * in every branch keeps the way out on screen while the content decides
 * what it is.
 */
export function ScreenHeader({ title }: { title: string }) {
  return (
    <Stack.Screen
      options={{
        headerShown: true,
        title,
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.text,
      }}
    />
  );
}
