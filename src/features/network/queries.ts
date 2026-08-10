import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
import type { Database } from '@/types/database.types';

export type ConnectionRow = Database['public']['Views']['my_connections']['Row'];
export type ConnectionNight = Database['public']['Views']['connection_nights']['Row'];

/** What a people search returns: enough to recognize someone and ask. */
export type PersonResult = {
  id: string;
  handle: string;
  stage_name: string;
  avatar_url: string | null;
  is_performer: boolean;
  is_producer: boolean;
};

/** Everyone in this person's network: accepted, waiting on them, and sent. */
export function useMyConnections(userId: string | undefined) {
  return useQuery({
    queryKey: ['network', 'connections', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ConnectionRow[]> => {
      const { data, error } = await getSupabase()
        .from('my_connections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        throw userError(error, 'Could not load your network. Try again.');
      }
      return data;
    },
  });
}

/** Upcoming nights the people you are connected with said yes to. */
export function useConnectionNights(userId: string | undefined) {
  return useQuery({
    queryKey: ['network', 'nights', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ConnectionNight[]> => {
      const { data, error } = await getSupabase()
        .from('connection_nights')
        .select('*')
        .order('starts_at');
      if (error) {
        throw userError(error, 'Could not load where your people will be. Try again.');
      }
      return data;
    },
  });
}

/**
 * Find people to connect with, by handle or stage name. The search runs
 * against public_profiles, so blocked, banned, and deleted accounts are
 * already filtered out server side.
 */
export function useSearchPeople(term: string, userId: string | undefined) {
  // PostgREST's or() splits on commas and parens; stripping them from the
  // term keeps a pasted oddity from becoming a filter instead of a search.
  const cleaned = term.trim().replace(/[,()]/g, '');
  return useQuery({
    queryKey: ['network', 'search', cleaned],
    enabled: !!userId && cleaned.length >= 2,
    queryFn: async (): Promise<PersonResult[]> => {
      const { data, error } = await getSupabase()
        .from('public_profiles')
        .select('id, handle, stage_name, avatar_url, is_performer, is_producer')
        .or(`handle.ilike.%${cleaned}%,stage_name.ilike.%${cleaned}%`)
        .neq('id', userId!)
        .limit(20);
      if (error) {
        throw userError(error, 'Could not search. Try again.');
      }
      // View columns arrive nullable in the generated types; a row without
      // an id or a name is one the screen could not render anyway.
      return (data ?? []).filter(
        (p): p is PersonResult => p.id !== null && p.handle !== null && p.stage_name !== null,
      );
    },
  });
}

export function useSendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, otherId }: { userId: string; otherId: string }) => {
      const { error } = await getSupabase()
        .from('connections')
        .insert({ requester_id: userId, addressee_id: otherId });
      if (error) {
        if (error.code === '23505') {
          throw new Error('You two are already connected, or a request is open.');
        }
        if (error.code === '42501') {
          throw new Error('This person cannot be added right now.');
        }
        if (error.code === 'P0010') {
          throw new Error('That is a lot of requests for one day. Try again tomorrow.');
        }
        throw userError(error, 'Could not send the request. Try again.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['network'] }),
  });
}

export function useAcceptRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, otherId }: { userId: string; otherId: string }) => {
      const { data, error } = await getSupabase()
        .from('connections')
        .update({ status: 'accepted' })
        .eq('requester_id', otherId)
        .eq('addressee_id', userId)
        .select('requester_id');
      if (error) {
        throw userError(error, 'Could not accept the request. Try again.');
      }
      // Row level security filters denied rows out of an update rather than
      // raising, so zero rows back means the request is gone or not yours.
      if (!data || data.length === 0) {
        throw new Error('That request is no longer open.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['network'] }),
  });
}

/**
 * One mutation for every way out: withdrawing a request you sent, declining
 * one you received, or ending an accepted connection. All are the same
 * delete, and none of them tells the other person.
 */
export function useRemoveConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, otherId }: { userId: string; otherId: string }) => {
      const { error } = await getSupabase()
        .from('connections')
        .delete()
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${otherId}),` +
            `and(requester_id.eq.${otherId},addressee_id.eq.${userId})`,
        );
      if (error) {
        throw userError(error, 'Could not remove the connection. Try again.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['network'] }),
  });
}

/** The attendance sharing toggle lives on the profile row. */
export function useSetShareAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, share }: { userId: string; share: boolean }) => {
      const { error } = await getSupabase()
        .from('profiles')
        .update({ share_attendance: share })
        .eq('id', userId);
      if (error) {
        throw userError(error, 'Could not save the choice. Try again.');
      }
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
