import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_FILTERS, type DiscoveryFilters } from '@/stores/filters';

/**
 * Local-only search history and named saved searches. A working comic runs
 * the same search weekly ("tuesdays close to home"), so the query plus its
 * filter state can be kept and re-run by name. Nothing here leaves the
 * device.
 */

export type SavedSearch = {
  name: string;
  query: string;
  filters: DiscoveryFilters;
};

const RECENT_LIMIT = 8;

type RecentSearchesState = {
  recent: string[];
  saved: SavedSearch[];
  addRecent: (query: string) => void;
  clearRecent: () => void;
  saveSearch: (name: string, query: string, filters: DiscoveryFilters) => void;
  removeSaved: (name: string) => void;
};

export const useRecentSearches = create<RecentSearchesState>()(
  persist(
    (set) => ({
      recent: [],
      saved: [],
      addRecent: (query) => {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
          return;
        }
        set((s) => ({
          recent: [trimmed, ...s.recent.filter((q) => q !== trimmed)].slice(0, RECENT_LIMIT),
        }));
      },
      clearRecent: () => set({ recent: [] }),
      saveSearch: (name, query, filters) =>
        set((s) => ({
          saved: [
            // Saving under an existing name replaces it: the name is the key.
            ...s.saved.filter((sv) => sv.name !== name),
            { name, query: query.trim(), filters: { ...DEFAULT_FILTERS, ...filters } },
          ],
        })),
      removeSaved: (name) => set((s) => ({ saved: s.saved.filter((sv) => sv.name !== name) })),
    }),
    {
      name: 'recent-searches',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
