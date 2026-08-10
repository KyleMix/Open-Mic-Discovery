import AsyncStorage from '@react-native-async-storage/async-storage';
import tzLookup from 'tz-lookup';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { WhenFilter } from '@/features/discovery/query-tokens';
import type { Discipline } from '@/theme';
import type { Database } from '@/types/database.types';

type SignupMethod = Database['public']['Enums']['signup_method'];
type AgeRestriction = Database['public']['Enums']['age_restriction'];

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

export const AGE_LABELS: Record<AgeRestriction, string> = {
  all_ages: 'All ages',
  eighteen_plus: '18+',
  twenty_one_plus: '21+',
};

export type DiscoveryFilters = {
  disciplines: Discipline[];
  /**
   * The When quick pick: real dates, resolved server side against the
   * venue-local calendar. Mutually exclusive with hand-picked weekdays.
   */
  when: WhenFilter | null;
  days: number[]; // ISO weekday numbers, 1 Monday .. 7 Sunday
  radiusKm: number;
  freeOnly: boolean;
  methods: SignupMethod[];
  ages: AgeRestriction[];
  timeOfDay: TimeOfDay | null;
};

/**
 * The members that actually select rows on the server, projected for the
 * discovery query key. UI-only state (view, the seeding flag) must never
 * reach the key: every extra member forks the cache and doubles what the
 * persister writes.
 */
export function selectDiscoveryFilters(state: DiscoveryFilters): DiscoveryFilters {
  const { disciplines, when, days, radiusKm, freeOnly, methods, ages, timeOfDay } = state;
  return { disciplines, when, days, radiusKm, freeOnly, methods, ages, timeOfDay };
}

export const DEFAULT_FILTERS: DiscoveryFilters = {
  disciplines: [],
  when: null,
  days: [],
  radiusKm: 40,
  freeOnly: false,
  methods: [],
  ages: [],
  timeOfDay: null,
};

type FiltersState = DiscoveryFilters & {
  view: 'map' | 'list';
  disciplinesSeeded: boolean;
  setView: (view: 'map' | 'list') => void;
  seedDisciplines: (ds: Discipline[]) => void;
  toggleDiscipline: (d: Discipline) => void;
  selectDiscipline: (d: Discipline | null) => void;
  /** Quick picks and hand-picked weekdays displace each other. */
  setWhen: (when: WhenFilter | null) => void;
  toggleDay: (day: number) => void;
  setDays: (days: number[]) => void;
  setRadiusKm: (km: number) => void;
  setFreeOnly: (freeOnly: boolean) => void;
  toggleMethod: (m: SignupMethod) => void;
  setMethods: (methods: SignupMethod[]) => void;
  toggleAge: (a: AgeRestriction) => void;
  setAges: (ages: AgeRestriction[]) => void;
  setTimeOfDay: (t: TimeOfDay | null) => void;
  reset: () => void;
};

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/**
 * Client-only UI state; the server data it selects lives in TanStack Query.
 * Persisted so radius, view choice, and cleared discipline chips survive a
 * relaunch. Day picks and the When quick pick are session state:
 * yesterday's "tonight" would silently mean the wrong day.
 */
export const useFiltersStore = create<FiltersState>()(
  persist(
    (set) => ({
      ...DEFAULT_FILTERS,
      view: 'list',
      disciplinesSeeded: false,
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
      setWhen: (when) => set({ when, days: [] }),
      // Hand-picked weekdays from the sheet mean the weekday pattern, so any
      // quick pick no longer applies.
      toggleDay: (day) => set((s) => ({ days: toggle(s.days, day), when: null })),
      setDays: (days) => set({ days, when: null }),
      setRadiusKm: (radiusKm) => set({ radiusKm }),
      setFreeOnly: (freeOnly) => set({ freeOnly }),
      toggleMethod: (m) => set((s) => ({ methods: toggle(s.methods, m) })),
      setMethods: (methods) => set({ methods }),
      toggleAge: (a) => set((s) => ({ ages: toggle(s.ages, a) })),
      setAges: (ages) => set({ ages }),
      setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
      reset: () => set({ ...DEFAULT_FILTERS }),
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
        ages: s.ages,
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

/**
 * How many filters live only inside the All filters sheet, for the badge on
 * its button. Discipline, the When quick picks, and Free have their own
 * visible controls, and every sheet filter also renders an applied chip in
 * the bar, so this count is a summary, not the only trace.
 */
export function sheetFilterCount(filters: DiscoveryFilters): number {
  let count = 0;
  if (filters.days.length > 0) {
    count += 1;
  }
  if (filters.timeOfDay !== null) {
    count += 1;
  }
  count += filters.methods.length;
  count += filters.ages.length;
  if (filters.radiusKm !== DEFAULT_FILTERS.radiusKm) {
    count += 1;
  }
  return count;
}

/** True when any filter deviates from the defaults (drives the Reset chip). */
export function hasActiveFilters(filters: DiscoveryFilters): boolean {
  return (
    filters.disciplines.length > 0 ||
    filters.when !== null ||
    filters.days.length > 0 ||
    filters.freeOnly ||
    filters.methods.length > 0 ||
    filters.ages.length > 0 ||
    filters.timeOfDay !== null ||
    filters.radiusKm !== DEFAULT_FILTERS.radiusKm
  );
}

/**
 * A local calendar date as the RPC's date type expects it, in the given
 * IANA zone when one is known. The zone matters once "Browse near" moves
 * the center to another city: a Seattle user at 10 PM asking for Tonight
 * in New York means New York's tonight, not a date that is already
 * yesterday there.
 */
function localDateISO(date: Date, timeZone?: string | null): string {
  if (timeZone) {
    try {
      // en-CA renders YYYY-MM-DD.
      return date.toLocaleDateString('en-CA', { timeZone });
    } catch {
      // An unknown zone falls back to the device date below.
    }
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The When quick pick as the server's window: venue-local calendar dates
 * plus, for the weekend, the weekday set. "Tonight" is the user's local
 * date; venues within driving distance share it.
 */
export function whenToWindow(
  when: WhenFilter | null,
  now: Date,
  timeZone?: string | null,
): { from?: string; to?: string; days?: number[] } {
  switch (when) {
    case 'tonight':
      return { from: localDateISO(now, timeZone), to: localDateISO(now, timeZone) };
    case 'tomorrow': {
      const tomorrow = addDays(now, 1);
      return { from: localDateISO(tomorrow, timeZone), to: localDateISO(tomorrow, timeZone) };
    }
    case 'week':
      return { from: localDateISO(now, timeZone), to: localDateISO(addDays(now, 6), timeZone) };
    case 'weekend': {
      const daysUntilSunday = (7 - isoWeekday(now)) % 7;
      return {
        from: localDateISO(now, timeZone),
        to: localDateISO(addDays(now, daysUntilSunday), timeZone),
        days: WEEKEND_DAYS,
      };
    }
    default:
      return {};
  }
}

export type SearchDiscoverArgs = Database['public']['Functions']['search_discover']['Args'];

/** tz-lookup never throws for finite coordinates, but guard anyway. */
function centerTimezone(lat: number, lng: number): string | null {
  try {
    return tzLookup(lat, lng);
  } catch {
    return null;
  }
}

/**
 * Translates UI filter state, the center, and the typed query into
 * search_discover arguments. One builder for browsing and searching: the
 * only difference is whether p_query carries text.
 */
export function filtersToDiscoverArgs(
  filters: DiscoveryFilters,
  center: { lat: number; lng: number } | null,
  query: string,
  now: Date = new Date(),
): SearchDiscoverArgs {
  // The center's zone, so the When quick picks mean the center's day.
  const centerZone = center ? centerTimezone(center.lat, center.lng) : null;
  const window = whenToWindow(filters.when, now, centerZone);
  const hourWindow = filters.timeOfDay ? TIME_WINDOWS[filters.timeOfDay] : null;
  const trimmed = query.trim();
  return {
    p_query: trimmed.length > 0 ? trimmed : undefined,
    p_lat: center?.lat,
    p_lng: center?.lng,
    // A typed name is the intent; a hard radius bound made a mic in the
    // next city unfindable by its exact name. Text searches go unbounded
    // and let the RPC's distance decay do the ranking; browsing keeps the
    // radius the person chose.
    p_radius_m: trimmed.length > 0 ? undefined : Math.round(filters.radiusKm * 1000),
    p_disciplines: filters.disciplines.length > 0 ? filters.disciplines : undefined,
    p_days: window.days ?? (filters.days.length > 0 ? filters.days : undefined),
    p_local_from: window.from,
    p_local_to: window.to,
    p_free_only: filters.freeOnly,
    p_methods: filters.methods.length > 0 ? filters.methods : undefined,
    p_ages: filters.ages.length > 0 ? filters.ages : undefined,
    p_start_hour: hourWindow?.startHour,
    p_end_hour: hourWindow?.endHour,
  };
}
