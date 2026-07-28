import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';

export function useFavorites(userId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('favorites')
        .select(
          'series_id, created_at, series:mic_series(id, title, disciplines, rrule, start_time, last_confirmed_at, venue:venues(name, city))',
        )
        .eq('profile_id', userId!)
        .order('created_at', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      return data;
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });
}
