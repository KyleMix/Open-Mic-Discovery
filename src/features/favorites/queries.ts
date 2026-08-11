import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useToast } from '@/components/toast';
import { registerPushToken } from '@/lib/notifications';
import { timed } from '@/lib/query-timing';
import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
import type { Database } from '@/types/database.types';

export type FavoriteItem = {
  series_id: string;
  created_at: string;
  next_starts_at: string | null;
  /** An imminent called-off night, so the card can say so. */
  cancelled_next_starts_at: string | null;
  /** Null on the optimistic stub row until the settled refetch fills it in. */
  series: {
    id: string;
    title: string;
    disciplines: string[];
    signup_method: Database['public']['Enums']['signup_method'];
    cost_cents: number;
    rrule: string;
    start_time: string;
    timezone: string;
    last_confirmed_at: string | null;
    poster_url: string | null;
    venue: { name: string; city: string; neighborhood: string | null } | null;
  } | null;
};

export function useFavorites(userId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', userId],
    enabled: !!userId,
    queryFn: async (): Promise<FavoriteItem[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('favorites')
        .select(
          // Everything the discovery card draws, so a favorite renders as the same
          // card as the mic it was saved from.
          'series_id, created_at, series:mic_series(id, title, disciplines, signup_method, cost_cents, rrule, start_time, timezone, last_confirmed_at, poster_url, venue:venues(name, city, neighborhood))',
        )
        .eq('profile_id', userId!)
        .order('created_at', { ascending: false });
      if (error) {
        throw userError(error, 'Could not load favorites. Check your connection and try again.');
      }
      // A favorites list that cannot say what is on tonight is a bookmark
      // graveyard: fetch each mic's next night and lead with the soonest.
      const seriesIds = data.map((f) => f.series_id);
      const nextBySeries: Record<string, string> = {};
      // A favorited mic whose imminent night was called off says so on the
      // card, instead of silently showing the following week.
      const cancelledBySeries: Record<string, string> = {};
      if (seriesIds.length > 0) {
        const { data: occurrences, error: occError } = await timed('favorites:nextNights', () =>
          supabase
            .from('mic_occurrences')
            .select('series_id, starts_at, status')
            .in('series_id', seriesIds)
            .gte('starts_at', new Date().toISOString())
            .order('starts_at'),
        );
        if (occError) {
          throw userError(
            occError,
            'Could not load favorites. Check your connection and try again.',
          );
        }
        for (const occ of occurrences) {
          if (occ.status === 'cancelled') {
            // Only a cancellation before the next live night is news.
            if (!nextBySeries[occ.series_id] && !cancelledBySeries[occ.series_id]) {
              cancelledBySeries[occ.series_id] = occ.starts_at;
            }
          } else if (!nextBySeries[occ.series_id]) {
            nextBySeries[occ.series_id] = occ.starts_at;
          }
        }
      }
      return data
        .map((f) => ({
          ...f,
          next_starts_at: nextBySeries[f.series_id] ?? null,
          cancelled_next_starts_at: cancelledBySeries[f.series_id] ?? null,
        }))
        .sort((a, b) => {
          if (a.next_starts_at === b.next_starts_at) {
            return 0;
          }
          if (a.next_starts_at === null) {
            return 1;
          }
          if (b.next_starts_at === null) {
            return -1;
          }
          return a.next_starts_at < b.next_starts_at ? -1 : 1;
        });
    },
  });
}

export function useIsFavorite(userId: string | undefined, seriesId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', userId, seriesId],
    enabled: !!userId && !!seriesId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('favorites')
        .select('series_id')
        .eq('profile_id', userId!)
        .eq('series_id', seriesId!)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not check your favorites. Try again.');
      }
      return !!data;
    },
  });
}

type FavoritesList = FavoriteItem[];
type ToggleVars = { userId: string; seriesId: string; favorite: boolean };
type ToggleContext = {
  prevList: FavoritesList | undefined;
  prevFlag: boolean | undefined;
};

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const toast = useToast();
  // The Undo action needs mutate, which does not exist while the options
  // object is being built; a ref closes the loop.
  const self = useRef<UseMutationResult<void, Error, ToggleVars, ToggleContext> | null>(null);
  const mutation = useMutation<void, Error, ToggleVars, ToggleContext>({
    mutationFn: async ({ userId, seriesId, favorite }) => {
      const supabase = getSupabase();
      if (favorite) {
        const { error } = await supabase
          .from('favorites')
          .upsert(
            { profile_id: userId, series_id: seriesId },
            { onConflict: 'profile_id,series_id', ignoreDuplicates: true },
          );
        if (error) {
          throw userError(error, 'Could not add the favorite. Try again.');
        }
      } else {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('profile_id', userId)
          .eq('series_id', seriesId);
        if (error) {
          throw userError(error, 'Could not remove the favorite. Try again.');
        }
      }
    },
    // Optimistic: the star flips the moment it is tapped and rolls back on
    // failure, instead of freezing for the whole round trip.
    onMutate: async ({ userId, seriesId, favorite }) => {
      const listKey = ['favorites', userId];
      const flagKey = ['favorites', userId, seriesId];
      await queryClient.cancelQueries({ queryKey: listKey });
      const prevList = queryClient.getQueryData<FavoritesList>(listKey);
      const prevFlag = queryClient.getQueryData<boolean>(flagKey);
      queryClient.setQueryData<boolean>(flagKey, favorite);
      queryClient.setQueryData<FavoritesList>(listKey, (old) => {
        if (!old) {
          return old;
        }
        if (!favorite) {
          return old.filter((f) => f.series_id !== seriesId);
        }
        if (old.some((f) => f.series_id === seriesId)) {
          return old;
        }
        // A stub row keeps every star in sync instantly; the settled
        // refetch fills in the joined series details.
        return [
          {
            series_id: seriesId,
            created_at: new Date().toISOString(),
            series: null,
            next_starts_at: null,
            cancelled_next_starts_at: null,
          },
          ...old,
        ];
      });
      return { prevList, prevFlag };
    },
    onError: (_e, { userId, seriesId, favorite }, context) => {
      if (context) {
        queryClient.setQueryData(['favorites', userId], context.prevList);
        queryClient.setQueryData(['favorites', userId, seriesId], context.prevFlag);
      }
      // The optimistic star has just flipped back; without a word that
      // reads as a glitch, not a failed save.
      toast.show(
        favorite
          ? 'Could not save the favorite. Check your connection.'
          : 'Could not remove the favorite. Check your connection.',
      );
    },
    onSuccess: (_d, vars) => {
      if (vars.favorite) {
        // Token refresh only; the OS dialog is primed for on the signup
        // card and the notification prefs screen, never fired blind.
        registerPushToken(vars.userId);
      } else {
        toast.show('Removed from favorites', {
          label: 'Undo',
          onPress: () => self.current?.mutate({ ...vars, favorite: true }),
        });
      }
    },
    onSettled: (_d, _e, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['favorites', userId] });
    },
  });
  useEffect(() => {
    self.current = mutation;
  });
  return mutation;
}
