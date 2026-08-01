import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';

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
      const { data, error } = await getSupabase()
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('id');
      if (error) {
        throw new Error(error.message);
      }
      // Row level security filters denied rows out of an update rather than
      // raising, so zero rows back means the write was refused, not applied.
      if (!data || data.length === 0) {
        throw new Error('Could not save your profile changes.');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
