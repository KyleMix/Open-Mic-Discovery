import { create } from 'zustand';

/**
 * Client-only overrides driven from Testing tools (admin accounts only).
 *
 * These never reach the server and never affect a real user: they exist so
 * the owner can see both sides of a gate without buying, refunding, or
 * waiting. Cleared on every app restart on purpose, so a forgotten override
 * cannot follow you into a real session.
 */

/** Producer Pro, forced one way or the other. 'off' means behave normally. */
export type ProOverride = 'off' | 'entitled' | 'locked';

type TestOverridesState = {
  proOverride: ProOverride;
  setProOverride: (next: ProOverride) => void;
  reset: () => void;
};

export const useTestOverridesStore = create<TestOverridesState>((set) => ({
  proOverride: 'off',
  setProOverride: (next) => set({ proOverride: next }),
  reset: () => set({ proOverride: 'off' }),
}));
