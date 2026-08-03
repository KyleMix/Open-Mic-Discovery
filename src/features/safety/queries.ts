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
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().rpc('delete_account');
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
        supabase
          .from('profiles')
          .select('id, handle, display_name, bio')
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
        profiles: profiles.data ?? [],
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
      const { error } = await getSupabase()
        .from('reports')
        .update({
          status: input.actioned ? 'actioned' : 'dismissed',
          resolved_by: input.adminId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', input.reportId);
      if (error) {
        throw userError(error, 'Could not resolve the report. Try again.');
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
