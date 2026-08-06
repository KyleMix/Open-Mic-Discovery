import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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

/**
 * The members that actually select rows on the server, projected for the
 * discovery query key. UI-only state (view, the seeding flag, the quick-pick
 * date bound) must never reach the key: every extra member forks the cache
 * and doubles what the persister writes.
 */
export function selectDiscoveryFilters(state: DiscoveryFilters): DiscoveryFilters {
  const { disciplines, days, radiusKm, freeOnly, methods, timeOfDay } = state;
  return { disciplines, days, radiusKm, freeOnly, methods, timeOfDay };
}

export const DEFAULT_FILTERS: DiscoveryFilters = {
  disciplines: [],
  days: [],
  radiusKm: 40,
  freeOnly: false,
  methods: [],
  timeOfDay: null,
};

/**
 * The Today and Weekend quick picks promise actual dates, not weekdays.
 * The server matches weekdays over a 14 day window, so the quick picks also
 * carry a date bound that the client applies to next_starts_at.
 */
export type DateBound = 'today' | 'weekend' | null;

type FiltersState = DiscoveryFilters & {
  view: 'map' | 'list';
  disciplinesSeeded: boolean;
  dateBound: DateBound;
  setView: (view: 'map' | 'list') => void;
  seedDisciplines: (ds: Discipline[]) => void;
  toggleDiscipline: (d: Discipline) => void;
  selectDiscipline: (d: Discipline | null) => void;
  setQuickPick: (pick: 'any' | 'today' | 'weekend', todayIso: number) => void;
  toggleDay: (day: number) => void;
  setDays: (days: number[]) => void;
  setRadiusKm: (km: number) => void;
  setFreeOnly: (freeOnly: boolean) => void;
  toggleMethod: (m: SignupMethod) => void;
  setMethods: (methods: SignupMethod[]) => void;
  setTimeOfDay: (t: TimeOfDay | null) => void;
  reset: () => void;
};

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/**
 * Client-only UI state; the server data it selects lives in TanStack Query.
 * Persisted so radius, view choice, and cleared discipline chips survive a
 * relaunch. Day picks and the Tonight/This weekend date bound are session
 * state: yesterday's "tonight" would silently mean the wrong day.
 */
export const useFiltersStore = create<FiltersState>()(
  persist(
    (set) => ({
      ...DEFAULT_FILTERS,
      view: 'list',
      disciplinesSeeded: false,
      dateBound: null,
      setView: (view) => set({ view }),
      // One-time default from the performer's own disciplines: what you do is
      // what you see first. Never overrides a selection the person already made.
      seedDisciplines: (ds) =>
        set((s) =>
          s.disciplinesSeeded || s.disciplines.length > 0
            ? { disciplinesSeeded: true }
            : { disciplinesSeeded: true, disciplines: ds },
        ),
      toggleDiscipline: (d) => set((s) => ({ disciplines: toggle(s.disciplines, d) })),
      selectDiscipline: (d) => set({ disciplines: d === null ? [] : [d] }),
      setQuickPick: (pick, todayIso) =>
        set(
          pick === 'today'
            ? { days: [todayIso], dateBound: 'today' }
            : pick === 'weekend'
              ? { days: WEEKEND_DAYS, dateBound: 'weekend' }
              : { days: [], dateBound: null },
        ),
      // Hand-picked weekdays from the sheet mean the weekday pattern, so the
      // quick-pick date bound no longer applies.
      toggleDay: (day) => set((s) => ({ days: toggle(s.days, day), dateBound: null })),
      setDays: (days) => set({ days, dateBound: null }),
      setRadiusKm: (radiusKm) => set({ radiusKm }),
      setFreeOnly: (freeOnly) => set({ freeOnly }),
      toggleMethod: (m) => set((s) => ({ methods: toggle(s.methods, m) })),
      setMethods: (methods) => set({ methods }),
      setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
      reset: () => set({ ...DEFAULT_FILTERS, dateBound: null }),
    }),
    {
      name: 'discovery-filters',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        disciplines: s.disciplines,
        disciplinesSeeded: s.disciplinesSeeded,
        radiusKm: s.radiusKm,
        freeOnly: s.freeOnly,
        methods: s.methods,
        timeOfDay: s.timeOfDay,
        view: s.view,
      }),
    },
  ),
);

/** ISO weekday for a local date, 1 Monday .. 7 Sunday. */
export function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/** Friday through Sunday: the nights most people can actually go out. */
export const WEEKEND_DAYS = [5, 6, 7];

export type DayQuickPick = 'any' | 'today' | 'weekend' | 'custom';

/** Which quick pick, if any, the current day selection matches. */
export function dayQuickPick(days: number[], todayIso: number): DayQuickPick {
  if (days.length === 0) {
    return 'any';
  }
  if (days.length === 1 && days[0] === todayIso) {
    return 'today';
  }
  const sorted = [...days].sort();
  if (sorted.length === WEEKEND_DAYS.length && sorted.every((d, i) => d === WEEKEND_DAYS[i])) {
    return 'weekend';
  }
  return 'custom';
}

/**
 * How many filters live only inside the All filters sheet, for the badge on
 * its button. Discipline, quick day picks, and Free have their own visible
 * controls, so they are not counted here.
 */
export function sheetFilterCount(filters: DiscoveryFilters, todayIso: number): number {
  let count = 0;
  if (dayQuickPick(filters.days, todayIso) === 'custom') {
    count += 1;
  }
  if (filters.timeOfDay !== null) {
    count += 1;
  }
  count += filters.methods.length;
  if (filters.radiusKm !== DEFAULT_FILTERS.radiusKm) {
    count += 1;
  }
  return count;
}

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
