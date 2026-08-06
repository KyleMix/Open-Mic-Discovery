import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';

import type { Credit, CreditRole } from './resolve';

/** The editable row, including anything still held for moderation. */
export type CreditRow = Database['public']['Tables']['mic_credits']['Row'];

/**
 * Credits as readers see them: approved only, with a linked profile's name and
 * links already resolved. One query covers the series defaults and every night
 * override, because a listing needs both to decide what to show.
 */
export function useSeriesCredits(seriesId: string | undefined) {
  return useQuery({
    queryKey: ['credits', seriesId],
    enabled: !!seriesId,
    queryFn: async (): Promise<Credit[]> => {
      const { data, error } = await getSupabase()
        .from('mic_credit_public')
        .select('*')
        .eq('series_id', seriesId!);
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

/**
 * The producer's view of their own credits, straight from the table so that
 * anything waiting on moderation is still visible to the person who wrote it.
 */
export function useManageCredits(seriesId: string | undefined) {
  return useQuery({
    queryKey: ['credits', 'manage', seriesId],
    enabled: !!seriesId,
    queryFn: async (): Promise<CreditRow[]> => {
      const { data, error } = await getSupabase()
        .from('mic_credits')
        .select('*')
        .eq('series_id', seriesId!);
      if (error) {
        throw new Error(error.message);
      }
      return data;
    },
  });
}

export type CreditInput = {
  seriesId: string;
  /** Null for the series default, an id to change one night only. */
  occurrenceId: string | null;
  role: CreditRole;
  userId: string;
  /** Set to credit an account, so name and links follow that profile. */
  profileId: string | null;
  name: string | null;
  link_instagram: string | null;
  link_tiktok: string | null;
  link_youtube: string | null;
  link_website: string | null;
  link_spotify: string | null;
  link_apple_music: string | null;
};

function useInvalidateCredits() {
  const queryClient = useQueryClient();
  return (seriesId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['credits'] });
    void queryClient.invalidateQueries({ queryKey: ['mic', seriesId] });
  };
}

/**
 * Sets the credit for a role, either on the series or on one night.
 *
 * Upsert rather than insert-or-update by hand: the table already declares one
 * credit per role per night, so the database decides whether this is new, and
 * two producers editing at once cannot create a duplicate between the check
 * and the write.
 */
export function useSetCredit() {
  const invalidate = useInvalidateCredits();
  return useMutation({
    mutationFn: async (input: CreditInput) => {
      if (!input.profileId && !input.name?.trim()) {
        throw new Error('Add a name, or pick someone with an account.');
      }
      const { data, error } = await getSupabase()
        .from('mic_credits')
        .upsert(
          {
            series_id: input.seriesId,
            occurrence_id: input.occurrenceId,
            role: input.role,
            profile_id: input.profileId,
            name: input.name?.trim() || null,
            link_instagram: input.link_instagram,
            link_tiktok: input.link_tiktok,
            link_youtube: input.link_youtube,
            link_website: input.link_website,
            link_spotify: input.link_spotify,
            link_apple_music: input.link_apple_music,
            created_by: input.userId,
          },
          { onConflict: 'series_id,occurrence_id,role' },
        )
        .select('id');
      if (error) {
        throw new Error(error.message);
      }
      // Row level security filters denied rows out of a write rather than
      // raising, so zero rows back means it was refused, not applied.
      if (!data || data.length === 0) {
        throw new Error('Could not save this credit. You may no longer manage this mic.');
      }
    },
    onSuccess: (_d, input) => invalidate(input.seriesId),
  });
}

export function useRemoveCredit() {
  const invalidate = useInvalidateCredits();
  return useMutation({
    mutationFn: async ({ creditId }: { creditId: string; seriesId: string }) => {
      const { data, error } = await getSupabase()
        .from('mic_credits')
        .delete()
        .eq('id', creditId)
        .select('id');
      if (error) {
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        throw new Error('Could not remove this credit. You may no longer manage this mic.');
      }
    },
    onSuccess: (_d, { seriesId }) => invalidate(seriesId),
  });
}

export type PickablePerson = {
  id: string;
  handle: string;
  stage_name: string;
  avatar_url: string | null;
};

/**
 * Finds accounts to credit. Reads public_profiles, so it can only ever offer
 * people who are visible anyway: no deleted, held, or blocking accounts, and
 * no private fields.
 */
export function usePersonSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['credits', 'people', trimmed],
    enabled: trimmed.length >= 2,
    queryFn: async (): Promise<PickablePerson[]> => {
      const { data, error } = await getSupabase()
        .from('public_profiles')
        .select('id, handle, stage_name, avatar_url')
        .or(`handle.ilike.%${trimmed}%,stage_name.ilike.%${trimmed}%`)
        .limit(10);
      if (error) {
        throw new Error(error.message);
      }
      return data.flatMap((row) =>
        row.id && row.handle && row.stage_name
          ? [
              {
                id: row.id,
                handle: row.handle,
                stage_name: row.stage_name,
                avatar_url: row.avatar_url,
              },
            ]
          : [],
      );
    },
  });
}
