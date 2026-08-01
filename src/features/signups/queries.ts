import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup'] }),
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
    const channel = getSupabase()
      .channel(`signups-${occurrenceId}`)
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
      getSupabase().removeChannel(channel);
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
      const { data, error } = await getSupabase()
        .from('signups')
        .update({ status })
        .eq('id', signupId)
        .select('id');
      if (error) {
        throw new Error(error.message);
      }
      // Row level security filters denied rows out of an update rather than
      // raising, so zero rows back means the write was refused, not applied.
      if (!data || data.length === 0) {
        throw new Error('Could not update this signup. You may no longer manage this night.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup'] }),
  });
}
