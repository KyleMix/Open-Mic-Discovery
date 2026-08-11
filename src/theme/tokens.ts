/**
 * Design tokens. Dark-first: the app is used at night in dim rooms.
 * Light values exist for system components that demand them, but every
 * screen defaults to the dark palette.
 */
import { Platform } from 'react-native';

export const palette = {
  /** Brand green, sampled from the Open Mic Explorer mark. */
  brand: '#0FFEA7',
  bg: '#0B0B0F',
  bgElevated: '#16161D',
  bgPressed: '#22222B',
  border: '#2E2E3A',
  text: '#F4F4F6',
  textSecondary: '#A8A8B3',
  // Faint but still readable: the quietest color allowed for meaningful
  // text. Passes WCAG AA (4.5:1) on bg, bgElevated, and bgPressed.
  textFaint: '#8E8E9A',
  // For genuinely disabled controls only, never for text someone needs to
  // read: it sits below the 4.5:1 AA floor on elevated surfaces.
  textDisabled: '#63636E',
  danger: '#FF5D5D',
  success: '#4CD97B',
  warning: '#FFC94D',
  /** The dim layer behind every bottom sheet and modal. */
  scrim: 'rgba(0, 0, 0, 0.6)',
  /** Secondary text drawn over a poster image, where textSecondary sinks. */
  textSecondaryOnImage: '#C9C9D2',
} as const;

/**
 * External brand colors, used only where a third-party mark is rendered
 * (profile social links). Kept here so no component invents hex values.
 */
export const brandColors = {
  instagram: '#E1306C',
  youtube: '#FF0000',
  spotify: '#1DB954',
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
 * Corner radii. sm: inputs and small chips, md: buttons and cards,
 * lg: prominent cards and sheets, pill: fully rounded.
 */
export const radius = {
  sm: 10,
  md: 12,
  lg: 14,
  pill: 999,
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
  /** Chip and control labels: between body and caption. */
  label: { fontSize: 15, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
} as const;

/**
 * Mirrored as literals in app.json (backgroundColor, splash, adaptive
 * icon: palette.bg; notification icon color: disciplineAccents.music).
 * Static JSON cannot import; change those four together with the palette.
 */

/**
 * Minimum touch target size per platform accessibility standards:
 * 44pt on iOS (HIG), 48dp on Android (Material).
 */
export const minTouchTarget = Platform.OS === 'android' ? 48 : 44;

/**
 * Dynamic type policy: text scales with the system setting, capped so
 * fixed chrome (buttons, chips, tight rows) grows without breaking.
 * Applied via maxFontSizeMultiplier on the shared primitives.
 */
export const maxFontScale = 1.6;
