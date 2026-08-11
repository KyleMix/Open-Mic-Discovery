import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';

/** The signed-in user's own profile row, or null before onboarding. */
export function useOwnProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not load your account. Check your connection and try again.');
      }
      return data;
    },
  });
}

/** The performer's own disciplines, used to personalize discovery. */
export function usePerformerDisciplines(userId: string | undefined) {
  return useQuery({
    queryKey: ['performer-disciplines', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('performer_profiles')
        .select('disciplines')
        .eq('profile_id', userId!)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not load your performer details. Try again.');
      }
      return data?.disciplines ?? [];
    },
  });
}

/**
 * The newest EULA version string only. This is all the acceptance gate needs
 * (it compares the profile's accepted version to the latest), and it runs on
 * every cold start, so it deliberately does not pull body_md: that markdown
 * is a few kilobytes read only when the terms screen is actually shown.
 */
export function useLatestEulaVersion() {
  return useQuery({
    queryKey: ['eula', 'latest', 'version'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('eula_versions')
        .select('version')
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not load the terms. Check your connection and try again.');
      }
      return data;
    },
  });
}

/** The newest EULA text, including the body markdown for the terms screen. */
export function useLatestEula() {
  return useQuery({
    queryKey: ['eula', 'latest'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('eula_versions')
        .select('version, body_md')
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not load the terms. Check your connection and try again.');
      }
      return data;
    },
  });
}
