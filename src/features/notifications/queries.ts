import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
import type { Database } from '@/types/database.types';

type Prefs = Database['public']['Tables']['notification_prefs']['Insert'];

export function useUpdatePrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, patch }: { userId: string; patch: Prefs }) => {
      const { error } = await getSupabase()
        .from('notification_prefs')
        .upsert({ ...patch, profile_id: userId }, { onConflict: 'profile_id' });
      if (error) {
        throw userError(error, 'Could not save the preference. Try again.');
      }
    },
    onSuccess: (_d, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['prefs', userId] });
    },
  });
}
