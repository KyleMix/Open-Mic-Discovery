import { create } from 'zustand';

import type { Discipline } from '@/theme';
import type { Database } from '@/types/database.types';

type SignupMethod = Database['public']['Enums']['signup_method'];

export type TimeOfDay = 'early' | 'evening' | 'late';

/** Local start-hour windows for the time-of-day filter. */
export const TIME_WINDOWS: Record<
  TimeOfDay,
  { startHour: number; endHour: number; label: string }
> = {
  early: { startHour: 0, endHour: 18, label: 'Before 6 PM' },
  evening: { startHour: 18, endHour: 21, label: '6 to 9 PM' },
  late: { startHour: 21, endHour: 24, label: 'After 9 PM' },
};

export type DiscoveryFilters = {
  disciplines: Discipline[];
  days: number[]; // ISO weekday numbers, 1 Monday .. 7 Sunday
  radiusKm: number;
  freeOnly: boolean;
  methods: SignupMethod[];
  timeOfDay: TimeOfDay | null;
};

export const DEFAULT_FILTERS: DiscoveryFilters = {
  disciplines: [],
  days: [],
  radiusKm: 40,
  freeOnly: false,
  methods: [],
  timeOfDay: null,
};

type FiltersState = DiscoveryFilters & {
  view: 'map' | 'list';
  setView: (view: 'map' | 'list') => void;
  toggleDiscipline: (d: Discipline) => void;
  toggleDay: (day: number) => void;
  setRadiusKm: (km: number) => void;
  setFreeOnly: (freeOnly: boolean) => void;
  toggleMethod: (m: SignupMethod) => void;
  setTimeOfDay: (t: TimeOfDay | null) => void;
  reset: () => void;
};

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Client-only UI state; the server data it selects lives in TanStack Query. */
export const useFiltersStore = create<FiltersState>((set) => ({
  ...DEFAULT_FILTERS,
  view: 'map',
  setView: (view) => set({ view }),
  toggleDiscipline: (d) => set((s) => ({ disciplines: toggle(s.disciplines, d) })),
  toggleDay: (day) => set((s) => ({ days: toggle(s.days, day) })),
  setRadiusKm: (radiusKm) => set({ radiusKm }),
  setFreeOnly: (freeOnly) => set({ freeOnly }),
  toggleMethod: (m) => set((s) => ({ methods: toggle(s.methods, m) })),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  reset: () => set({ ...DEFAULT_FILTERS }),
}));

export type MicsNearArgs = Database['public']['Functions']['mics_near']['Args'];

/** Translates UI filter state into mics_near RPC arguments. */
export function filtersToRpcArgs(
  filters: DiscoveryFilters,
  center: { lat: number; lng: number },
): MicsNearArgs {
  const window = filters.timeOfDay ? TIME_WINDOWS[filters.timeOfDay] : null;
  return {
    p_lat: center.lat,
    p_lng: center.lng,
    p_radius_m: Math.round(filters.radiusKm * 1000),
    p_disciplines: filters.disciplines.length > 0 ? filters.disciplines : undefined,
    p_days: filters.days.length > 0 ? filters.days : undefined,
    p_free_only: filters.freeOnly,
    p_methods: filters.methods.length > 0 ? filters.methods : undefined,
    p_start_hour: window?.startHour,
    p_end_hour: window?.endHour,
  };
}

/** True when any filter deviates from the defaults (drives the Reset chip). */
export function hasActiveFilters(filters: DiscoveryFilters): boolean {
  return (
    filters.disciplines.length > 0 ||
    filters.days.length > 0 ||
    filters.freeOnly ||
    filters.methods.length > 0 ||
    filters.timeOfDay !== null ||
    filters.radiusKm !== DEFAULT_FILTERS.radiusKm
  );
}
