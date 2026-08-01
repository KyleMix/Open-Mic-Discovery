import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';

type SeriesUpdate = Database['public']['Tables']['mic_series']['Update'];
type SeriesInsert = Database['public']['Tables']['mic_series']['Insert'];
type VenueInsert = Database['public']['Tables']['venues']['Insert'];
type OccurrenceUpdate = Database['public']['Tables']['mic_occurrences']['Update'];

/** Series this user controls: owned, or created and still unclaimed. */
export function useMySeries(userId: string | undefined) {
  return useQuery({
    queryKey: ['producer', 'series', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('mic_series')
        .select('*, venue:venues(name, city)')
        .or(`owner_id.eq.${userId},and(created_by.eq.${userId},owner_id.is.null)`)
        .is('deleted_at', null)
        .order('title');
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

function useInvalidateSeries() {
  const queryClient = useQueryClient();
  return (seriesId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['producer'] });
    queryClient.invalidateQueries({ queryKey: ['mics'] });
    if (seriesId) {
      queryClient.invalidateQueries({ queryKey: ['mic', seriesId] });
    }
  };
}

/** One-tap confirm. The server stamps the time and identity; the value sent is ignored. */
export function useConfirmSeries() {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: async (seriesId: string) => {
      const { data, error } = await getSupabase()
        .from('mic_series')
        .update({ last_confirmed_at: new Date().toISOString() })
        .eq('id', seriesId)
        .select('id');
      if (error) {
        throw new Error(error.message);
      }
      // Row level security filters denied rows out of an update rather than
      // raising, so zero rows back means the write was refused, not applied.
      if (!data || data.length === 0) {
        throw new Error('Could not confirm this mic. You may no longer manage it.');
      }
    },
    onSuccess: (_d, seriesId) => invalidate(seriesId),
  });
}

export function useUpdateSeries() {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: async ({ seriesId, patch }: { seriesId: string; patch: SeriesUpdate }) => {
      const { data, error } = await getSupabase()
        .from('mic_series')
        .update(patch)
        .eq('id', seriesId)
        .select('id');
      if (error) {
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        throw new Error('Could not save these changes. You may no longer manage this mic.');
      }
    },
    onSuccess: (_d, { seriesId }) => invalidate(seriesId),
  });
}

export function useUpdateOccurrence() {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: async ({
      occurrenceId,
      seriesId,
      patch,
    }: {
      occurrenceId: string;
      seriesId: string;
      patch: OccurrenceUpdate;
    }) => {
      const { data, error } = await getSupabase()
        .from('mic_occurrences')
        .update(patch)
        .eq('id', occurrenceId)
        .select('id');
      if (error) {
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        throw new Error('Could not save this night. You may no longer manage this mic.');
      }
      return seriesId;
    },
    onSuccess: (_d, { seriesId }) => invalidate(seriesId),
  });
}

export type CreateSeriesInput = {
  series: Omit<SeriesInsert, 'venue_id' | 'created_by'>;
  /** Either an existing venue id, or a new venue to create. */
  venueId?: string;
  newVenue?: Omit<VenueInsert, 'created_by' | 'location'> & { lat: number; lng: number };
  userId: string;
};

export function useCreateSeries() {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: async (input: CreateSeriesInput) => {
      const supabase = getSupabase();
      let venueId = input.venueId;
      if (!venueId) {
        if (!input.newVenue) {
          throw new Error('Pick a venue or add a new one.');
        }
        const { lat, lng, ...venueFields } = input.newVenue;
        const { data, error } = await supabase
          .from('venues')
          .insert({
            ...venueFields,
            created_by: input.userId,
            location: `POINT(${lng} ${lat})`,
          })
          .select('id')
          .single();
        if (error) {
          throw new Error(error.message);
        }
        venueId = data.id;
      }
      const { data: series, error: seriesError } = await supabase
        .from('mic_series')
        .insert({
          ...input.series,
          venue_id: venueId,
          created_by: input.userId,
          owner_id: input.userId,
        })
        .select('id')
        .single();
      if (seriesError) {
        throw new Error(seriesError.message);
      }
      return series.id;
    },
    onSuccess: (seriesId) => invalidate(seriesId),
  });
}

export function useVenueSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['venues', 'search', trimmed],
    enabled: trimmed.length >= 2,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('venues')
        .select('id, name, address_line, city, region')
        .or(`name.ilike.%${trimmed}%,city.ilike.%${trimmed}%`)
        .is('deleted_at', null)
        .limit(12);
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

export function useSeriesOccurrences(seriesId: string | undefined) {
  return useQuery({
    queryKey: ['producer', 'occurrences', seriesId],
    enabled: !!seriesId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('mic_occurrences')
        .select('*')
        .eq('series_id', seriesId!)
        // Reaches back half a day, not to now: a mic that started an hour ago
        // is the one most likely to need the controls, and filtering on the
        // start time alone made a running show disappear from its own list.
        .gte('starts_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
        .order('starts_at')
        .limit(10);
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

/**
 * One night plus the parts of its series the night screen needs: the method
 * decides how a headcount is worded, and the timezone decides what "tonight"
 * means.
 */
export function useNightContext(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['producer', 'night', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('mic_occurrences')
        .select('*, series:mic_series(id, title, signup_method, timezone, set_length_minutes)')
        .eq('id', occurrenceId!)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

/**
 * Ending the show. The server clears every on-deck flag with it: "you are on
 * deck" is a promise you are about to be called up, and after the show it is
 * not true of anybody.
 */
export function useEndShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (occurrenceId: string) => {
      const { error } = await getSupabase().rpc('end_show', { p_occurrence_id: occurrenceId });
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producer'] });
      return queryClient.invalidateQueries({ queryKey: ['signup'] });
    },
  });
}

/** For the host who ended the night while people were still waiting to go up. */
export function useReopenShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (occurrenceId: string) => {
      const { error } = await getSupabase()
        .from('mic_occurrences')
        .update({ live_ended_at: null })
        .eq('id', occurrenceId);
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['producer'] }),
  });
}

export function useSubmitClaim() {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: async ({
      seriesId,
      userId,
      evidence,
    }: {
      seriesId: string;
      userId: string;
      evidence: string;
    }) => {
      const { error } = await getSupabase().from('claim_requests').insert({
        series_id: seriesId,
        requester_id: userId,
        evidence,
      });
      if (error) {
        if (error.code === '23505') {
          throw new Error('You already have a pending claim on this mic.');
        }
        throw new Error(error.message);
      }
    },
    onSuccess: () => invalidate(),
  });
}

/** Admin: the pending claim queue. */
export function usePendingClaims(isAdmin: boolean) {
  return useQuery({
    queryKey: ['producer', 'claims'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('claim_requests')
        .select('*, series:mic_series(title)')
        .eq('status', 'pending')
        .order('created_at');
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

export function useReviewClaim() {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: async ({ claimId, approve }: { claimId: string; approve: boolean }) => {
      const { error } = await getSupabase().rpc('review_claim', {
        p_claim_id: claimId,
        p_approve: approve,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => invalidate(),
  });
}

/** Enables the producer role on an existing account (dual roles are normal). */
export function useEnableProducerRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_producer: true })
        .eq('id', userId)
        .select('id');
      if (error) {
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        throw new Error('Could not enable producer tools on this account.');
      }
      const { error: ppError } = await supabase
        .from('producer_profiles')
        .upsert({ profile_id: userId }, { onConflict: 'profile_id', ignoreDuplicates: true });
      if (ppError) {
        throw new Error(ppError.message);
      }
    },
    onSuccess: (_d, userId) => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
