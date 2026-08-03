import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';

export type ProfilePatch = {
  display_name: string;
  bio: string | null;
  home_city: string | null;
  home_region: string | null;
  home_postal_code: string | null;
  home_lat: number | null;
  home_lng: number | null;
  avatar_url: string | null;
  link_instagram: string | null;
  link_tiktok: string | null;
  link_youtube: string | null;
  link_website: string | null;
};

export function useUpdateProfile(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ProfilePatch>) => {
      if (!userId) {
        throw new Error('Not signed in.');
      }
      const { error } = await getSupabase().from('profiles').update(patch).eq('id', userId);
      if (error) {
        throw userError(error, 'Could not save your profile. Try again.');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
