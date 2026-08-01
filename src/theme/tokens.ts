/**
 * Design tokens. Dark-first: the app is used at night in dim rooms.
 * Light values exist for system components that demand them, but every
 * screen defaults to the dark palette.
 */

export const palette = {
  /** Brand green, sampled from the Open Mic Explorer mark. */
  brand: '#0FFEA7',
  bg: '#0B0B0F',
  bgElevated: '#16161D',
  bgPressed: '#22222B',
  border: '#2E2E3A',
  text: '#F4F4F6',
  textSecondary: '#A8A8B3',
  textDisabled: '#63636E',
  danger: '#FF5D5D',
  success: '#4CD97B',
  warning: '#FFC94D',
} as const;

/**
 * One accent per discipline, used consistently across map markers, filter
 * chips, and listing cards so the map is scannable at a glance. Chosen for
 * contrast against the dark background (all pass 3:1 on palette.bg) and for
 * mutual distinguishability, including for red-green color vision deficiency.
 */
export const disciplineAccents = {
  music: '#4DA6FF',
  comedy: '#FFB84D',
  poetry: '#C084FC',
  other: '#8A8A96',
} as const;

export type Discipline = keyof typeof disciplineAccents;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Brand typography: Poppins, matching the geometric wordmark in the logo.
 * Loaded in the root layout; falls back to the system font until ready.
 */
export const fonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
} as const;

export const type = {
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  heading: { fontSize: 20, fontWeight: '600', lineHeight: 26 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
} as const;

/** Minimum touch target size per accessibility standards. */
export const minTouchTarget = 44;
