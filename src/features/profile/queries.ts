import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';

type Discipline = Database['public']['Enums']['discipline'];

export type ProfilePatch = {
  stage_name: string;
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

/**
 * One-tap performer enable, mirroring useEnableProducerRole. Used where a
 * non-performer hits a performer-only action (signing up for a slot) so
 * the fix is a single tap instead of a trip through settings.
 */
export function useEnablePerformerRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('profiles')
        .update({ is_performer: true })
        .eq('id', userId);
      if (error) {
        throw new Error(error.message);
      }
      const { error: ppError } = await supabase
        .from('performer_profiles')
        .upsert({ profile_id: userId }, { onConflict: 'profile_id', ignoreDuplicates: true });
      if (ppError) {
        throw new Error(ppError.message);
      }
    },
    onSuccess: (_d, userId) => {
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      void queryClient.invalidateQueries({ queryKey: ['performer-disciplines', userId] });
    },
  });
}

export type RolesPatch = {
  isPerformer: boolean;
  isProducer: boolean;
  disciplines: Discipline[];
};

/** Saves roles and performer disciplines from the Edit profile screen. */
export function useUpdateRoles(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ isPerformer, isProducer, disciplines }: RolesPatch) => {
      if (!userId) {
        throw new Error('Not signed in.');
      }
      const supabase = getSupabase();
      const { error } = await supabase
        .from('profiles')
        .update({ is_performer: isPerformer, is_producer: isProducer })
        .eq('id', userId);
      if (error) {
        throw new Error(error.message);
      }
      if (isPerformer) {
        const { error: ppError } = await supabase
          .from('performer_profiles')
          .upsert({ profile_id: userId, disciplines }, { onConflict: 'profile_id' });
        if (ppError) {
          throw new Error(ppError.message);
        }
      }
      if (isProducer) {
        const { error: prError } = await supabase
          .from('producer_profiles')
          .upsert({ profile_id: userId }, { onConflict: 'profile_id', ignoreDuplicates: true });
        if (prError) {
          throw new Error(prError.message);
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      void queryClient.invalidateQueries({ queryKey: ['performer-disciplines', userId] });
    },
  });
}
