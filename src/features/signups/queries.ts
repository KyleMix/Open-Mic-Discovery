import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { uniqueChannelTopic } from '@/lib/realtime';
import { getSupabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';

export type SignupStatus = Database['public']['Enums']['signup_status'];
export type RosterRow = Database['public']['Views']['signup_roster']['Row'];

export function useMySignup(occurrenceId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['signup', 'mine', occurrenceId, userId],
    enabled: !!occurrenceId && !!userId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('signups')
        .select('*')
        .eq('occurrence_id', occurrenceId!)
        .eq('performer_id', userId!)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

/**
 * How full a night is. Public: the whole point is that someone browsing sees
 * the pressure before they tap. Counts only, never who.
 */
export function useNightSpots(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['signup', 'spots', occurrenceId],
    enabled: !!occurrenceId,
    // The number moves as people sign up, and a stale one is the reason
    // someone taps expecting a slot and lands on a waitlist.
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('occurrence_spots')
        .select('capacity, taken, spots_left, planning_performers')
        .eq('occurrence_id', occurrenceId!)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

export function useJoinList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ occurrenceId, userId }: { occurrenceId: string; userId: string }) => {
      const { error } = await getSupabase()
        .from('signups')
        .insert({ occurrence_id: occurrenceId, performer_id: userId });
      if (error) {
        if (error.code === '42501') {
          throw new Error('Signups are not open for this night.');
        }
        if (error.code === '23505') {
          throw new Error('You are already on this list.');
        }
        throw new Error(error.message);
      }
    },
    // Getting on the list is the moment the whole app exists for. A tap
    // confirms it landed without the person having to read anything.
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      return queryClient.invalidateQueries({ queryKey: ['signup'] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
    },
  });
}

export function useWithdraw() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ occurrenceId, userId }: { occurrenceId: string; userId: string }) => {
      const { error } = await getSupabase()
        .from('signups')
        .delete()
        .eq('occurrence_id', occurrenceId)
        .eq('performer_id', userId);
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup'] }),
  });
}

/** The producer's roster for a night, kept live via Realtime. */
export function useRoster(occurrenceId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['signup', 'roster', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async (): Promise<RosterRow[]> => {
      const { data, error } = await getSupabase()
        .from('signup_roster')
        .select('*')
        .eq('occurrence_id', occurrenceId!)
        .order('slot_position', { ascending: true, nullsFirst: false })
        .order('created_at');
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });

  useEffect(() => {
    if (!occurrenceId) {
      return;
    }
    const supabase = getSupabase();
    // Own topic per subscription: a shared one would be handed back already
    // joined after a remount, and adding the callback would throw. See
    // src/lib/realtime.ts.
    const channel = supabase
      .channel(uniqueChannelTopic('signups', occurrenceId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'signups',
          filter: `occurrence_id=eq.${occurrenceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['signup', 'roster', occurrenceId] });
          queryClient.invalidateQueries({ queryKey: ['signup', 'mine', occurrenceId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [occurrenceId, queryClient]);

  return query;
}

export function useDrawLottery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (occurrenceId: string) => {
      const { data, error } = await getSupabase().rpc('draw_lottery', {
        p_occurrence_id: occurrenceId,
      });
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup'] }),
  });
}

export function useSetSlotOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      occurrenceId,
      signupIds,
    }: {
      occurrenceId: string;
      signupIds: string[];
    }) => {
      const { error } = await getSupabase().rpc('set_slot_order', {
        p_occurrence_id: occurrenceId,
        p_signup_ids: signupIds,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup'] }),
  });
}

/** Producer-only: flag the next performer as on deck (server-enforced). */
export function useMarkOnDeck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ signupId, onDeck }: { signupId: string; onDeck: boolean }) => {
      const { error } = await getSupabase().rpc('mark_on_deck', {
        p_signup_id: signupId,
        p_on_deck: onDeck,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup'] }),
  });
}

export function useSetSignupStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ signupId, status }: { signupId: string; status: SignupStatus }) => {
      const { error } = await getSupabase().from('signups').update({ status }).eq('id', signupId);
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup'] }),
  });
}
