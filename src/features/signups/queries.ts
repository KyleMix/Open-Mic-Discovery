import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useToast } from '@/components/toast';
import { registerPushToken } from '@/lib/notifications';
import { uniqueChannelTopic } from '@/lib/realtime';
import { getSupabase } from '@/lib/supabase';
import { JOIN_LIST_MUTATION_KEY } from '@/features/signups/join-key';
import { userError } from '@/lib/user-error';
import type { Database } from '@/types/database.types';

export type SignupStatus = Database['public']['Enums']['signup_status'];
export type RosterRow = Database['public']['Views']['signup_roster']['Row'];

export function useMySignup(occurrenceId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
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
        throw userError(error, 'Could not check your signup. Try again.');
      }
      return data;
    },
  });

  // Draw results, waitlist promotion, and on-deck land while the performer
  // is staring at this screen; without realtime they only see it on re-entry.
  useEffect(() => {
    if (!userId) {
      return;
    }
    // A unique topic per subscription: the signup card and the sticky footer
    // both run this hook on the mic page, and supabase-js hands a repeated
    // topic the same already-subscribed channel, which throws on .on().
    const channel = getSupabase()
      .channel(uniqueChannelTopic('signups-mine', userId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'signups',
          filter: `performer_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['signup', 'mine'] });
          queryClient.invalidateQueries({ queryKey: ['signup', 'counts'] });
        },
      )
      .subscribe();
    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}

export type MyNight = {
  id: string;
  status: SignupStatus;
  slot_position: number | null;
  occurrence: {
    id: string;
    starts_at: string;
    status: Database['public']['Enums']['occurrence_status'];
    series: { id: string; title: string; timezone: string } | null;
  } | null;
};

/**
 * Every night this performer signed up for, upcoming and past, so the
 * profile can show a schedule and a history instead of nothing.
 */
export function useMyNights(userId: string | undefined) {
  return useQuery({
    queryKey: ['signup', 'my-nights', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MyNight[]> => {
      const { data, error } = await getSupabase()
        .from('signups')
        .select(
          'id, status, slot_position, occurrence:mic_occurrences(id, starts_at, status, series:mic_series(id, title, timezone))',
        )
        .eq('performer_id', userId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        throw userError(error, 'Could not load your nights. Try again.');
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
        throw userError(error, 'Could not check how full this night is.');
      }
      return data;
    },
  });
}

export function useJoinList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...JOIN_LIST_MUTATION_KEY],
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
        throw userError(error, 'Could not sign you up. Try again.');
      }
    },
    // Getting on the list is the moment the whole app exists for. A tap
    // confirms it landed without the person having to read anything.
    onSuccess: (_d, { userId }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      // First signup is the moment push starts mattering (status changes,
      // on deck); ask for permission here, not at app launch.
      registerPushToken(userId, { promptIfNeeded: true });
      return queryClient.invalidateQueries({ queryKey: ['signup'] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
    },
  });
}

export function useWithdraw() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Undo re-signs up (per the withdraw copy, at the end of the list, not
  // the old slot). Failures come back translated: the window may have
  // closed between the withdraw and the tap.
  async function rejoin(occurrenceId: string, userId: string): Promise<void> {
    const { error } = await getSupabase()
      .from('signups')
      .insert({ occurrence_id: occurrenceId, performer_id: userId });
    if (error && error.code !== '23505') {
      const friendly =
        error.code === '42501'
          ? new Error('Could not put you back on: signups closed for this night.')
          : userError(error, 'Could not put you back on the list. Try again from the mic page.');
      toast.show(friendly.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['signup'] });
    toast.show('You are back on the list.');
  }

  return useMutation({
    mutationFn: async ({ occurrenceId, userId }: { occurrenceId: string; userId: string }) => {
      const { error } = await getSupabase()
        .from('signups')
        .delete()
        .eq('occurrence_id', occurrenceId)
        .eq('performer_id', userId);
      if (error) {
        throw userError(error, 'Could not withdraw. Try again.');
      }
    },
    onSuccess: (_d, { occurrenceId, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['signup'] });
      // The card reverting to "Sign me up" alone reads as a glitch, not a
      // confirmation that the spot was given up.
      toast.show('You are off the list.', {
        label: 'Undo',
        onPress: () => {
          void rejoin(occurrenceId, userId);
        },
      });
    },
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
        throw userError(error, 'Could not load the list. Try again.');
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
          queryClient.invalidateQueries({ queryKey: ['signup', 'counts', occurrenceId] });
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
        throw userError(error, 'The draw did not run. Try again.');
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
        throw userError(error, 'Could not reorder the list. Try again.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup'] }),
  });
}

/**
 * Anonymous taken-versus-capacity for a night, so a performer can tell
 * whether signing up confirms them or waitlists them. No names.
 */
export function useSignupCounts(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['signup', 'counts', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('signup_counts', {
        p_occurrence_id: occurrenceId!,
      });
      if (error) {
        throw userError(error, 'Could not check how many spots are taken.');
      }
      return data?.[0] ?? null;
    },
  });
}

/** Producer-only: put a walk-in on the list by name, no account needed. */
export function useAddWalkIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      occurrenceId,
      guestName,
    }: {
      occurrenceId: string;
      guestName: string;
    }) => {
      const { error } = await getSupabase()
        .from('signups')
        .insert({ occurrence_id: occurrenceId, guest_name: guestName });
      if (error) {
        if (error.code === '42501') {
          throw new Error('Only the producer of this mic can add walk-ins.');
        }
        throw userError(error, 'Could not add them to the list. Try again.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signup'] }),
  });
}

/** Producer-only: remove a walk-in guest from the list. */
export function useRemoveWalkIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (signupId: string) => {
      const { error } = await getSupabase().from('signups').delete().eq('id', signupId);
      if (error) {
        throw userError(error, 'Could not remove them from the list. Try again.');
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
        throw userError(error, 'Could not update on deck. Try again.');
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
        throw userError(error, 'Could not update their status. Try again.');
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
