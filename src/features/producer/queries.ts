import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/toast';
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
    // Dual roles are the normal case: a host who cancels their own night is
    // often on that night's list too, so the performer-side surfaces
    // (Going, Favorites) refresh with the producer ones.
    queryClient.invalidateQueries({ queryKey: ['plan'] });
    queryClient.invalidateQueries({ queryKey: ['favorites'] });
    if (seriesId) {
      queryClient.invalidateQueries({ queryKey: ['mic', seriesId] });
    }
  };
}

/** One-tap confirm. The server stamps the time and identity; the value sent is ignored. */
export function useConfirmSeries() {
  const invalidate = useInvalidateSeries();
  const toast = useToast();
  return useMutation({
    mutationFn: async (seriesId: string) => {
      const { data, error } = await getSupabase()
        .from('mic_series')
        .update({ last_confirmed_at: new Date().toISOString() })
        .eq('id', seriesId)
        .select('id');
      if (error) {
        throw userError(
          error,
          'Could not confirm the listing. Check your connection and try again.',
        );
      }
      // Row level security filters denied rows out of an update rather than
      // raising, so zero rows back means the write was refused, not applied.
      if (!data || data.length === 0) {
        throw new Error('Could not confirm this mic. You may no longer manage it.');
      }
    },
    onSuccess: (_d, seriesId) => {
      invalidate(seriesId);
      // This is the core producer loop; a chip quietly turning green is
      // too easy to miss to count as confirmation.
      toast.show('Confirmed. Performers now see this listing as checked today.');
    },
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
        throw userError(error, 'Could not save the changes. Try again.');
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
        throw userError(error, 'Could not save that night. Try again.');
      }
      if (!data || data.length === 0) {
        throw new Error('Could not save this night. You may no longer manage this mic.');
      }
      return seriesId;
    },
    onSuccess: (_d, { seriesId }) => invalidate(seriesId),
  });
}

/**
 * Cancels one night, with Undo on the toast. The screen's confirmation
 * sheet stays in front of this; the toast is the safety net after it.
 */
export function useCancelNight() {
  const invalidate = useInvalidateSeries();
  const toast = useToast();

  async function restore(occurrenceId: string, seriesId: string): Promise<void> {
    const { data, error } = await getSupabase()
      .from('mic_occurrences')
      .update({ status: 'scheduled', cancellation_note: null })
      .eq('id', occurrenceId)
      .eq('status', 'cancelled')
      .select('id');
    if (error || !data || data.length === 0) {
      toast.show(
        error
          ? userError(error, 'Could not restore the night. Check it on the Manage screen.').message
          : 'Could not restore the night. Check it on the Manage screen.',
      );
      return;
    }
    invalidate(seriesId);
    toast.show('The night is back on.');
  }

  return useMutation({
    mutationFn: async ({
      occurrenceId,
      seriesId,
      note,
    }: {
      occurrenceId: string;
      seriesId: string;
      note: string | null;
      /** Already-formatted night name for the toast, e.g. "Tonight". */
      dateLabel: string;
    }) => {
      const { data, error } = await getSupabase()
        .from('mic_occurrences')
        .update({ status: 'cancelled', cancellation_note: note })
        .eq('id', occurrenceId)
        .select('id');
      if (error) {
        throw userError(error, 'Could not cancel that night. Try again.');
      }
      // RLS filters a refused update to zero rows without an error. Without
      // this check a host who no longer manages the mic (or is sanctioned)
      // got a confident receipt naming notifications that were never sent.
      if (!data || data.length === 0) {
        throw new Error('Could not cancel this night. You may no longer manage this mic.');
      }
      return seriesId;
    },
    onSuccess: (_d, { occurrenceId, seriesId, dateLabel }) => {
      invalidate(seriesId);
      toast.show(`${dateLabel} is cancelled. Performers on the list are notified.`, {
        label: 'Undo',
        onPress: () => {
          void restore(occurrenceId, seriesId);
        },
      });
    },
  });
}

/**
 * Pauses a listing (this app's remove-a-listing action; nights leave the
 * schedule until resumed), with Undo on the toast. The confirmation sheet
 * stays in front of this.
 */
export function usePauseSeries() {
  const invalidate = useInvalidateSeries();
  const toast = useToast();

  async function resume(seriesId: string): Promise<void> {
    const { data, error } = await getSupabase()
      .from('mic_series')
      .update({ is_active: true })
      .eq('id', seriesId)
      .select('id');
    if (error || !data || data.length === 0) {
      toast.show(
        error
          ? userError(error, 'Could not resume the listing. Try again from My Mics.').message
          : 'Could not resume the listing. Try again from My Mics.',
      );
      return;
    }
    invalidate(seriesId);
    toast.show('The listing is live again.');
  }

  return useMutation({
    mutationFn: async (seriesId: string) => {
      const { data, error } = await getSupabase()
        .from('mic_series')
        .update({ is_active: false })
        .eq('id', seriesId)
        .select('id');
      if (error) {
        throw userError(error, 'Could not pause the listing. Try again.');
      }
      // Same zero-row rule as useUpdateSeries: a silently filtered update
      // must not produce a "Listing paused" receipt.
      if (!data || data.length === 0) {
        throw new Error('Could not pause this listing. You may no longer manage this mic.');
      }
    },
    onSuccess: (_d, seriesId) => {
      invalidate(seriesId);
      toast.show('Listing paused. Upcoming nights are off the schedule.', {
        label: 'Undo',
        onPress: () => {
          void resume(seriesId);
        },
      });
    },
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
        // Reaches back half a day, not to now: a mic that started an hour ago
        // is the one most likely to need the controls, and filtering on the
        // start time alone made a running show disappear from its own list.
        .gte('starts_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
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
        .select(
          'id, starts_at, status, override_title, series:mic_series(id, title, timezone, owner_id, created_by)',
        )
        .eq('id', occurrenceId!)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not load this night. Try again.');
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
        .select(
          '*, series:mic_series(id, title, signup_method, timezone, set_length_minutes, owner_id, created_by)',
        )
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
        throw userError(error, 'Could not end the show. Try again.');
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
        throw userError(error, 'Could not reopen the show. Try again.');
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

// The enable-performer mutation lives in features/profile/queries.ts; a
// near-identical copy used to sit here too, drifting on error copy and
// cache invalidation. One implementation, one behavior.

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
        throw userError(error, 'Could not enable the producer role. Try again.');
      }
      if (!data || data.length === 0) {
        throw new Error('Could not enable producer tools on this account.');
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
