import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
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
  link_spotify: string | null;
  link_apple_music: string | null;
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
        throw userError(error, 'Could not save your profile. Try again.');
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
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_performer: true })
        .eq('id', userId)
        .select('id');
      if (error) {
        throw userError(error, 'Could not turn on performing. Try again.');
      }
      // A refused update comes back as zero rows, not an error; without
      // this the button spun, settled, and the card still said the role
      // was missing, forever.
      if (!data || data.length === 0) {
        throw new Error('Could not turn on performing for this account.');
      }
      const { error: ppError } = await supabase
        .from('performer_profiles')
        .upsert({ profile_id: userId }, { onConflict: 'profile_id', ignoreDuplicates: true });
      if (ppError) {
        throw userError(ppError, 'Could not turn on performing. Try again.');
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
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_performer: isPerformer, is_producer: isProducer })
        .eq('id', userId)
        .select('id');
      if (error) {
        throw userError(error, 'Could not update your roles. Try again.');
      }
      if (!data || data.length === 0) {
        throw new Error('Could not update your roles. You may need to sign in again.');
      }
      // The two role upserts touch different tables and do not depend on each
      // other, so they run together rather than as two serial round trips.
      const [ppResult, prResult] = await Promise.all([
        isPerformer
          ? supabase
              .from('performer_profiles')
              .upsert({ profile_id: userId, disciplines }, { onConflict: 'profile_id' })
          : Promise.resolve({ error: null }),
        isProducer
          ? supabase
              .from('producer_profiles')
              .upsert({ profile_id: userId }, { onConflict: 'profile_id', ignoreDuplicates: true })
          : Promise.resolve({ error: null }),
      ]);
      if (ppResult.error) {
        throw userError(ppResult.error, 'Could not update your roles. Try again.');
      }
      if (prResult.error) {
        throw userError(prResult.error, 'Could not update your roles. Try again.');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      void queryClient.invalidateQueries({ queryKey: ['performer-disciplines', userId] });
    },
  });
}
