import { create } from 'zustand';

/**
 * Client-only state carried across the EULA and onboarding screens.
 * Nothing here is server state; it is discarded once onboarding completes.
 */
type OnboardingState = {
  acceptedEulaVersion: string | null;
  setAcceptedEulaVersion: (version: string) => void;
  reset: () => void;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  acceptedEulaVersion: null,
  setAcceptedEulaVersion: (version) => set({ acceptedEulaVersion: version }),
  reset: () => set({ acceptedEulaVersion: null }),
}));
