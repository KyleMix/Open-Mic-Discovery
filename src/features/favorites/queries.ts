import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { registerPushToken } from '@/lib/notifications';
import { getSupabase } from '@/lib/supabase';

export function useFavorites(userId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', userId],
    enabled: !!userId,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('favorites')
        .select(
          'series_id, created_at, series:mic_series(id, title, disciplines, rrule, start_time, timezone, last_confirmed_at, venue:venues(name, city))',
        )
        .eq('profile_id', userId!)
        .order('created_at', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      // A favorites list that cannot say what is on tonight is a bookmark
      // graveyard: fetch each mic's next night and lead with the soonest.
      const seriesIds = data.map((f) => f.series_id);
      const nextBySeries: Record<string, string> = {};
      if (seriesIds.length > 0) {
        const { data: occurrences, error: occError } = await supabase
          .from('mic_occurrences')
          .select('series_id, starts_at')
          .in('series_id', seriesIds)
          .gte('starts_at', new Date().toISOString())
          .neq('status', 'cancelled')
          .order('starts_at');
        if (occError) {
          throw new Error(occError.message);
        }
        for (const occ of occurrences) {
          if (!nextBySeries[occ.series_id]) {
            nextBySeries[occ.series_id] = occ.starts_at;
          }
        }
      }
      return data
        .map((f) => ({ ...f, next_starts_at: nextBySeries[f.series_id] ?? null }))
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
        throw new Error(error.message);
      }
      return !!data;
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      seriesId,
      favorite,
    }: {
      userId: string;
      seriesId: string;
      favorite: boolean;
    }) => {
      const supabase = getSupabase();
      if (favorite) {
        const { error } = await supabase
          .from('favorites')
          .upsert(
            { profile_id: userId, series_id: seriesId },
            { onConflict: 'profile_id,series_id', ignoreDuplicates: true },
          );
        if (error) {
          throw new Error(error.message);
        }
      } else {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('profile_id', userId)
          .eq('series_id', seriesId);
        if (error) {
          throw new Error(error.message);
        }
      }
    },
    onSuccess: (_d, { userId, favorite }) => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      if (favorite) {
        // Favoriting implies wanting the day-of reminder; a natural moment
        // to ask for push permission.
        registerPushToken(userId, { promptIfNeeded: true });
      }
    },
  });
}
