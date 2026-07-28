import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';

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
        throw new Error(error.message);
      }
      return data;
    },
  });
}

/** The newest EULA text, needed for the acceptance gate. */
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
        throw new Error(error.message);
      }
      return data;
    },
  });
}
