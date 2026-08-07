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
    // Only in-app destinations, and never an auth screen: consuming a path
    // inside the funnel would bounce straight back into it.
    if (path.startsWith('/') && !path.startsWith('/(auth)')) {
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
