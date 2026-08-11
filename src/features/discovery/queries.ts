import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { STARTED_GRACE_MS } from '@/features/discovery/next-occurrence';
import { timed } from '@/lib/query-timing';
import { getSupabase } from '@/lib/supabase';
import { uniqueChannelTopic } from '@/lib/realtime';
import { userError } from '@/lib/user-error';
import { filtersToDiscoverArgs, type DiscoveryFilters } from '@/stores/filters';
import type { Database } from '@/types/database.types';

export type NearbyMic = Database['public']['Functions']['mics_near']['Returns'][number];
export type DiscoverResult = Database['public']['Functions']['search_discover']['Returns'][number];

/**
 * The one discovery feed: browsing and searching are the same query. An
 * empty string browses (proximity and time rank); text narrows the same
 * ranked feed through the server's full text and fuzzy passes, with every
 * filter still applied.
 *
 * Request lifecycle: the caller debounces the query; each distinct
 * (filters, center, query) is its own cache key, so a slow stale response
 * can never overwrite a newer one; and the abort signal is passed through
 * to the fetch, so a superseded request stops consuming the connection
 * instead of completing pointlessly (performers search on one bar of
 * cellular).
 */
export function useDiscoverFeed(
  filters: DiscoveryFilters,
  center: { lat: number; lng: number } | null,
  query: string,
) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['mics', 'discover', trimmed, center, filters],
    // Typing re-keys the query; keeping the previous results on screen
    // stops the pane flashing back to a skeleton mid-word.
    placeholderData: keepPreviousData,
    // One quick retry for a network blip; the global two-retry default
    // makes a dead search take three backoffs to admit failure.
    retry: 1,
    queryFn: async ({ signal }): Promise<DiscoverResult[]> => {
      const { data, error } = await timed('discover:feed', () =>
        getSupabase()
          .rpc('search_discover', filtersToDiscoverArgs(filters, center, trimmed))
          .abortSignal(signal),
      );
      if (error) {
        // No cause asserted here: userError supplies the connection wording
        // when it really was the connection, and a code-specific message
        // when the server explained itself.
        throw userError(error, 'Could not load mics. Try again.');
      }
      return data;
    },
  });
}

/** What the empty screen can offer instead of a dead end. */
export type SearchRecovery =
  { kind: 'radius'; count: number; radiusKm: number } | { kind: 'window'; count: number } | null;

/** The next radius step up from the current one, or null at the widest. */
export function widerRadiusKm(currentKm: number): number | null {
  const steps = [8, 16, 40, 80];
  const next = steps.find((km) => km > currentKm);
  return next ?? null;
}

/**
 * When the feed comes back empty, probe the two relaxations worth
 * offering, in the order they help: the same search wider, then the same
 * search on other days. Best effort: a probe that fails is a missing
 * suggestion, never an error screen.
 */
export function useSearchRecovery(
  filters: DiscoveryFilters,
  center: { lat: number; lng: number } | null,
  query: string,
  enabled: boolean,
) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['mics', 'recover', trimmed, center, filters],
    enabled,
    retry: false,
    queryFn: async ({ signal }): Promise<SearchRecovery> => {
      const supabase = getSupabase();
      // Text searches already run unbounded (filtersToDiscoverArgs drops
      // the radius when a query is present), so widening cannot help them;
      // the radius probe is a browse-mode recovery only.
      const wider = trimmed.length === 0 ? widerRadiusKm(filters.radiusKm) : null;
      if (wider !== null) {
        const { data } = await supabase
          .rpc(
            'search_discover',
            filtersToDiscoverArgs({ ...filters, radiusKm: wider }, center, trimmed),
          )
          .abortSignal(signal);
        if (data && data.length > 0) {
          return { kind: 'radius', count: data.length, radiusKm: wider };
        }
      }
      if (filters.when !== null || filters.days.length > 0) {
        const { data } = await supabase
          .rpc(
            'search_discover',
            filtersToDiscoverArgs({ ...filters, when: null, days: [] }, center, trimmed),
          )
          .abortSignal(signal);
        if (data && data.length > 0) {
          return { kind: 'window', count: data.length };
        }
      }
      return null;
    },
  });
}

export function useMicDetail(seriesId: string | undefined) {
  const queryClient = useQueryClient();

  // A host cancelling or moving tonight must reach the performer already
  // staring at the page: without this, the old time stayed up until a
  // manual refresh. Both tables broadcast (20260810000600) and are public
  // reads, so RLS lets any viewer of the page subscribe.
  useEffect(() => {
    if (!seriesId) {
      return;
    }
    const supabase = getSupabase();
    const channel = supabase
      .channel(uniqueChannelTopic('mic-detail', seriesId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mic_occurrences',
          filter: `series_id=eq.${seriesId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['mic', seriesId] });
          // The Going tab reads the same nights through a view and stays
          // mounted behind the tabs; refresh it too.
          queryClient.invalidateQueries({ queryKey: ['plan'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mic_series', filter: `id=eq.${seriesId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['mic', seriesId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [seriesId, queryClient]);

  return useQuery({
    queryKey: ['mic', seriesId],
    enabled: !!seriesId,
    queryFn: async () => {
      const supabase = getSupabase();
      const [seriesRes, occurrencesRes] = await timed('mic:detail', () =>
        Promise.all([
          supabase.from('mic_series').select('*, venue:venues(*)').eq('id', seriesId!).maybeSingle(),
          supabase
            .from('mic_occurrences')
            .select('*')
            .eq('series_id', seriesId!)
            // Trails the clock so tonight's mic stays on its own page while
            // the show runs; at showtime the page used to flip to next week
            // and take the performer's slot and on-deck state with it.
            .gte('starts_at', new Date(Date.now() - STARTED_GRACE_MS).toISOString())
            .order('starts_at')
            .limit(6),
        ]),
      );
      if (seriesRes.error) {
        throw userError(seriesRes.error, 'Could not load this listing. Try again.');
      }
      if (occurrencesRes.error) {
        throw userError(occurrencesRes.error, 'Could not load this listing. Try again.');
      }
      if (!seriesRes.data) {
        return null;
      }
      // Stewardship: claimed listings show who stands behind them. A
      // failed lookup degrades to "Host-managed", never an error.
      let ownerVerified = false;
      if (seriesRes.data.owner_id) {
        const { data: producerRow } = await supabase
          .from('producer_public')
          .select('verified')
          .eq('profile_id', seriesRes.data.owner_id)
          .maybeSingle();
        ownerVerified = producerRow?.verified ?? false;
      }
      return { series: seriesRes.data, occurrences: occurrencesRes.data, ownerVerified };
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
        throw userError(error, 'Could not submit the flag. Try again.');
      }
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ['mic', input.seriesId] });
    },
  });
}
