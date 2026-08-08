import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { signOut } from '@/features/auth/api';
import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
import type { Database } from '@/types/database.types';

export type ReportTarget = Database['public']['Enums']['report_target'];
export type ReportReason = Database['public']['Enums']['report_reason'];

export function useSubmitReport() {
  return useMutation({
    mutationFn: async (input: {
      reporterId: string;
      targetType: ReportTarget;
      targetId: string;
      reason: ReportReason;
      details: string | null;
    }) => {
      const { error } = await getSupabase().from('reports').insert({
        reporter_id: input.reporterId,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        details: input.details,
      });
      if (error) {
        throw userError(error, 'Could not submit the report. Try again.');
      }
    },
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ blockerId, blockedId }: { blockerId: string; blockedId: string }) => {
      const { error } = await getSupabase()
        .from('blocks')
        .insert({ blocker_id: blockerId, blocked_id: blockedId });
      if (error && error.code !== '23505') {
        throw userError(error, 'Could not block them. Try again.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ blockerId, blockedId }: { blockerId: string; blockedId: string }) => {
      const { error } = await getSupabase()
        .from('blocks')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId);
      if (error) {
        throw userError(error, 'Could not unblock them. Try again.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useBlockedUsers(userId: string | undefined) {
  return useQuery({
    queryKey: ['blocks', userId],
    enabled: !!userId,
    // The view exists because blocks hide the blocked profile from
    // public_profiles in both directions; without it the list could only
    // say "Blocked user" and unblocking was guesswork.
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('blocked_profiles')
        .select('blocked_id, blocked_at, handle, display_name');
      if (error) {
        throw userError(error, 'Could not load blocked users. Try again.');
      }
      return data;
    },
  });
}

/** Deletes the account server side, then ends the local session. */
export function useDeleteAccount(userId: string | undefined) {
  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      // The avatar image can only be removed through the Storage API (the
      // database forbids direct storage deletes), and only while this
      // session still exists. Best effort: a failure here must not leave
      // someone unable to delete their account over a leftover image.
      if (userId) {
        try {
          const { data: files } = await supabase.storage.from('avatars').list(userId);
          if (files && files.length > 0) {
            await supabase.storage
              .from('avatars')
              .remove(files.map((file) => `${userId}/${file.name}`));
          }
        } catch {
          // Offline or storage unavailable; the account deletion still runs.
        }
      }
      const { error } = await supabase.rpc('delete_account');
      if (error) {
        throw userError(error, 'Could not delete the account. Try again, or contact support.');
      }
      await signOut().catch(() => null);
    },
  });
}

/** Admin: everything awaiting action, in one queue query. */
export function useModerationQueue(isAdmin: boolean) {
  return useQuery({
    queryKey: ['moderation', 'queue'],
    enabled: isAdmin,
    queryFn: async () => {
      const supabase = getSupabase();
      const [profiles, venues, series, reports, flags] = await Promise.all([
        // admin_profile_review, not profiles: admins no longer read the base
        // table (migration 20260807001600). The view carries what reviewing held
        // content needs and omits display_name, birth_year and home_city, which
        // reach an admin only through admin_reveal, against a reason and an
        // audit row. display_name was selected here and never rendered.
        supabase
          .from('admin_profile_review')
          .select('id, handle, stage_name, bio')
          .eq('moderation_status', 'pending')
          .is('deleted_at', null),
        supabase
          .from('venues')
          .select('id, name, parking_notes')
          .eq('moderation_status', 'pending'),
        supabase
          .from('mic_series')
          .select('id, title, description')
          .eq('moderation_status', 'pending'),
        supabase
          .from('reports')
          .select('*')
          .in('status', ['open', 'in_review'])
          .order('created_at'),
        supabase.from('listing_flags').select('*, series:mic_series(title)').eq('status', 'open'),
      ]);
      for (const result of [profiles, venues, series, reports, flags]) {
        if (result.error) {
          throw userError(result.error, 'Could not load the queue. Try again.');
        }
      }
      return {
        // Every column of a view arrives nullable in the generated types,
        // because Postgres does not record a not-null constraint on a view
        // column even when the column underneath has one. Narrowing here rather
        // than asserting it away at the call site: a row that somehow arrived
        // without an id is one the screen cannot act on anyway.
        profiles: (profiles.data ?? []).filter(
          (p): p is typeof p & { id: string; handle: string; stage_name: string } =>
            p.id !== null && p.handle !== null && p.stage_name !== null,
        ),
        venues: venues.data ?? [],
        series: series.data ?? [],
        reports: reports.data ?? [],
        flags: flags.data ?? [],
      };
    },
  });
}

export function useModerateContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { target: ReportTarget; targetId: string; approve: boolean }) => {
      const { error } = await getSupabase().rpc('moderate_content', {
        p_target: input.target,
        p_target_id: input.targetId,
        p_approve: input.approve,
      });
      if (error) {
        throw userError(error, 'Could not save the decision. Try again.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moderation'] }),
  });
}

export function useResolveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reportId: string; adminId: string; actioned: boolean }) => {
      const { data, error } = await getSupabase()
        .from('reports')
        .update({
          status: input.actioned ? 'actioned' : 'dismissed',
          resolved_by: input.adminId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', input.reportId)
        .select('id');
      if (error) {
        throw userError(error, 'Could not resolve the report. Try again.');
      }
      // Row level security filters denied rows out of an update rather than
      // raising, so zero rows back means the write was refused, not applied.
      if (!data || data.length === 0) {
        throw new Error('Could not resolve this report. It may already be resolved.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moderation'] }),
  });
}

export function useResolveFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    // The RPC resolves the flag AND acts on it: a confirmed "this mic is
    // dead" flag pauses the listing and notifies the owner, instead of
    // stamping a row and changing nothing.
    mutationFn: async (input: { flagId: string; adminId: string; confirmed: boolean }) => {
      const { error } = await getSupabase().rpc('resolve_flag', {
        p_flag_id: input.flagId,
        p_confirm: input.confirmed,
      });
      if (error) {
        throw userError(error, 'Could not resolve the flag. Try again.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation'] });
      queryClient.invalidateQueries({ queryKey: ['mics'] });
    },
  });
}
