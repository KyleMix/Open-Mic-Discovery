import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { filtersToRpcArgs, type DiscoveryFilters } from '@/stores/filters';
import type { Database } from '@/types/database.types';

export type NearbyMic = Database['public']['Functions']['mics_near']['Returns'][number];
export type SearchResult = Database['public']['Functions']['search_mics']['Returns'][number];

export function useNearbyMics(filters: DiscoveryFilters, center: { lat: number; lng: number }) {
  return useQuery({
    queryKey: ['mics', 'near', center, filters],
    queryFn: async (): Promise<NearbyMic[]> => {
      const { data, error } = await getSupabase().rpc(
        'mics_near',
        filtersToRpcArgs(filters, center),
      );
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

export function useSearchMics(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['mics', 'search', trimmed],
    enabled: trimmed.length >= 2,
    // Typing re-keys the query per keystroke; keeping the previous results
    // on screen stops the pane flashing back to a spinner mid-word.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SearchResult[]> => {
      const { data, error } = await getSupabase().rpc('search_mics', { p_query: trimmed });
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

export function useMicDetail(seriesId: string | undefined) {
  return useQuery({
    queryKey: ['mic', seriesId],
    enabled: !!seriesId,
    queryFn: async () => {
      const supabase = getSupabase();
      const [seriesRes, occurrencesRes] = await Promise.all([
        supabase.from('mic_series').select('*, venue:venues(*)').eq('id', seriesId!).maybeSingle(),
        supabase
          .from('mic_occurrences')
          .select('*')
          .eq('series_id', seriesId!)
          .gte('starts_at', new Date().toISOString())
          .order('starts_at')
          .limit(6),
      ]);
      if (seriesRes.error) {
        throw new Error(seriesRes.error.message);
      }
      if (occurrencesRes.error) {
        throw new Error(occurrencesRes.error.message);
      }
      if (!seriesRes.data) {
        return null;
      }
      return { series: seriesRes.data, occurrences: occurrencesRes.data };
    },
  });
}

type FlagInput = {
  seriesId: string;
  flaggerId: string;
  reason: Database['public']['Enums']['flag_reason'];
  details: string | null;
};

export function useFlagListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FlagInput) => {
      const { error } = await getSupabase().from('listing_flags').insert({
        series_id: input.seriesId,
        flagger_id: input.flaggerId,
        reason: input.reason,
        details: input.details,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ['mic', input.seriesId] });
    },
  });
}
