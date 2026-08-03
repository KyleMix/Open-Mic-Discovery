import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
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
        throw userError(error, 'Could not load your mics. Check your connection and try again.');
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
      const { error } = await getSupabase()
        .from('mic_series')
        .update({ last_confirmed_at: new Date().toISOString() })
        .eq('id', seriesId);
      if (error) {
        throw userError(error, 'Could not confirm the listing. Check your connection and try again.');
      }
    },
    onSuccess: (_d, seriesId) => invalidate(seriesId),
  });
}

export function useUpdateSeries() {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: async ({ seriesId, patch }: { seriesId: string; patch: SeriesUpdate }) => {
      const { error } = await getSupabase().from('mic_series').update(patch).eq('id', seriesId);
      if (error) {
        throw userError(error, 'Could not save the changes. Try again.');
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
      const { error } = await getSupabase()
        .from('mic_occurrences')
        .update(patch)
        .eq('id', occurrenceId);
      if (error) {
        throw userError(error, 'Could not save that night. Try again.');
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
          throw userError(error, 'Could not save the venue. Check the address and try again.');
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
        throw userError(seriesError, 'Could not create the listing. Try again.');
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
        throw userError(error, 'Venue search failed. Try again.');
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
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(10);
      if (error) {
        throw userError(error, 'Could not load the upcoming nights. Try again.');
      }
      return data;
    },
  });
}

/** One night with its mic, for screens that need to say which night they manage. */
export function useOccurrenceContext(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['producer', 'occurrence', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('mic_occurrences')
        .select('id, starts_at, status, override_title, series:mic_series(id, title)')
        .eq('id', occurrenceId!)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not load this night. Try again.');
      }
      return data;
    },
  });
}

export type NextNight = { occurrenceId: string; startsAt: string; signupCount: number };

/**
 * The next scheduled night and its signup count per series, so the producer
 * dashboard can lead with what is coming instead of an undated card.
 */
export function useNextNights(seriesIds: string[]) {
  return useQuery({
    queryKey: ['producer', 'next-nights', [...seriesIds].sort()],
    enabled: seriesIds.length > 0,
    queryFn: async (): Promise<Record<string, NextNight>> => {
      const { data, error } = await getSupabase()
        .from('mic_occurrences')
        .select('id, series_id, starts_at, signups(count)')
        .in('series_id', seriesIds)
        .eq('status', 'scheduled')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at');
      if (error) {
        throw userError(error, 'Could not load the upcoming nights. Try again.');
      }
      const bySeries: Record<string, NextNight> = {};
      for (const row of data) {
        if (!bySeries[row.series_id]) {
          bySeries[row.series_id] = {
            occurrenceId: row.id,
            startsAt: row.starts_at,
            signupCount: row.signups[0]?.count ?? 0,
          };
        }
      }
      return bySeries;
    },
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
        throw userError(error, 'Could not submit the claim. Try again.');
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
        throw userError(error, 'Could not load the pending claims. Try again.');
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
        throw userError(error, 'Could not update the claim. Try again.');
      }
    },
    onSuccess: () => invalidate(),
  });
}

/** Enables the performer role on an existing account (dual roles are normal). */
export function useEnablePerformerRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('profiles')
        .update({ is_performer: true })
        .eq('id', userId);
      if (error) {
        throw userError(error, 'Could not turn on performing. Try again.');
      }
      const { error: ppError } = await supabase
        .from('performer_profiles')
        .upsert({ profile_id: userId }, { onConflict: 'profile_id', ignoreDuplicates: true });
      if (ppError) {
        throw userError(ppError, 'Could not turn on performing. Try again.');
      }
    },
    onSuccess: (_d, userId) => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}

/** Enables the producer role on an existing account (dual roles are normal). */
export function useEnableProducerRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('profiles')
        .update({ is_producer: true })
        .eq('id', userId);
      if (error) {
        throw userError(error, 'Could not enable the producer role. Try again.');
      }
      const { error: ppError } = await supabase
        .from('producer_profiles')
        .upsert({ profile_id: userId }, { onConflict: 'profile_id', ignoreDuplicates: true });
      if (ppError) {
        throw userError(ppError, 'Could not enable the producer role. Try again.');
      }
    },
    onSuccess: (_d, userId) => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
