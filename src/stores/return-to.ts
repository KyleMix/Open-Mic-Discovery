import { create } from 'zustand';

/**
 * Where to land after the auth funnel finishes.
 *
 * Signing in used to always end on the Discover tab, so a person who tapped
 * "Sign in to get on the list" on a mic page came back to the wrong screen
 * and had to find the mic again. Whoever sends someone into the funnel
 * records the way back here; the auth gate consumes it on the far side,
 * however many hops the funnel took (sign-in, sign-up, the EULA gate,
 * onboarding).
 *
 * In-memory on purpose: an app relaunch mid-funnel lands on Discover, which
 * is the right default when the trail has gone cold.
 */
type ReturnToState = {
  path: string | null;
  setReturnTo: (path: string) => void;
  consumeReturnTo: () => string | null;
};

export const useReturnToStore = create<ReturnToState>((set, get) => ({
  path: null,
  setReturnTo: (path) => {
    // Only in-app destinations, and never the auth machinery itself:
    // consuming a funnel screen or the confirmation callback would bounce
    // straight back into it.
    if (path.startsWith('/') && !path.startsWith('/(auth)') && !path.startsWith('/auth-callback')) {
      set({ path });
    }
  },
  consumeReturnTo: () => {
    const { path } = get();
    set({ path: null });
    return path;
  },
}));

export function setReturnTo(path: string): void {
  useReturnToStore.getState().setReturnTo(path);
}

export function consumeReturnTo(): string | null {
  return useReturnToStore.getState().consumeReturnTo();
}
