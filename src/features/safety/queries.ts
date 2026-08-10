import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { signOut } from '@/features/auth/api';
import { clearCachedData } from '@/lib/query-client';
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
      // The persisted cache holds the deleted account's private rows (home
      // area, admin queue for admins); a deleted account leaves nothing on
      // the device.
      await clearCachedData().catch(() => null);
    },
  });
}

/**
 * Whether this account may read the moderation queue: full admins
 * (profiles.is_admin) and read_only reviewers on the admin allowlist both
 * qualify; only the former get action buttons, and the server re-checks
 * every write regardless.
 */
export function useIsAdminReader(userId: string | undefined) {
  return useQuery({
    queryKey: ['moderation', 'reader', userId],
    enabled: !!userId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await getSupabase().rpc('am_admin_reader');
      if (error) {
        // Reading the queue is a convenience; a failed probe is "no".
        return false;
      }
      return data ?? false;
    },
  });
}

/**
 * The caller's live sanction, if any. The reason column is written to be
 * read by the sanctioned person (they need it to appeal); without this the
 * app showed a suspended account nothing but unrelated, wrongly worded
 * failures.
 */
export function useMySanction(userId: string | undefined) {
  return useQuery({
    queryKey: ['sanction', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('user_sanctions')
        .select('type, scope, reason, expires_at')
        .eq('user_id', userId!)
        .is('lifted_at', null)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        // The banner is best-effort; a failed check shows nothing.
        return null;
      }
      return data;
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
      const [profiles, venues, series, credits, reports, flags] = await Promise.all([
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
        // Held lineup credits were the one pending state nothing could
        // approve: the producer saw "(waiting on review)" forever.
        supabase
          .from('mic_credits')
          .select('id, role, name, profile_id, series:mic_series(title)')
          .eq('moderation_status', 'pending'),
        supabase
          .from('reports')
          .select('*')
          .in('status', ['open', 'in_review'])
          .order('created_at'),
        supabase.from('listing_flags').select('*, series:mic_series(title)').eq('status', 'open'),
      ]);
      for (const result of [profiles, venues, series, credits, reports, flags]) {
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
        credits: credits.data ?? [],
        reports: await describeReportTargets(reports.data ?? []),
        flags: flags.data ?? [],
      };
    },
  });
}

type ReportRow = Database['public']['Tables']['reports']['Row'];
export type DescribedReport = ReportRow & { targetLabel: string | null };

/**
 * What each report is about, fetched per target type so the moderator can
 * see the content they are ruling on instead of only its category.
 * Best-effort: a failed lookup leaves the label null, never blocks the
 * queue.
 */
async function describeReportTargets(reports: ReportRow[]): Promise<DescribedReport[]> {
  const supabase = getSupabase();
  const ids = (t: ReportRow['target_type']) =>
    reports.filter((r) => r.target_type === t).map((r) => r.target_id);
  const labels = new Map<string, string>();
  try {
    const [series, profiles, venues, credits] = await Promise.all([
      ids('series').length
        ? supabase.from('mic_series').select('id, title, description').in('id', ids('series'))
        : Promise.resolve({ data: [] }),
      ids('profile').length
        ? supabase
            .from('admin_profile_review')
            .select('id, handle, stage_name, bio')
            .in('id', ids('profile'))
        : Promise.resolve({ data: [] }),
      ids('venue').length
        ? supabase.from('venues').select('id, name').in('id', ids('venue'))
        : Promise.resolve({ data: [] }),
      ids('credit').length
        ? supabase.from('mic_credits').select('id, name, role').in('id', ids('credit'))
        : Promise.resolve({ data: [] }),
    ]);
    for (const s of series.data ?? []) {
      labels.set(s.id, `"${s.title}"${s.description ? `: ${s.description}` : ''}`);
    }
    for (const p of profiles.data ?? []) {
      if (p.id) {
        labels.set(p.id, `@${p.handle} (${p.stage_name})${p.bio ? `: ${p.bio}` : ''}`);
      }
    }
    for (const v of venues.data ?? []) {
      labels.set(v.id, v.name);
    }
    for (const c of credits.data ?? []) {
      labels.set(c.id, `${c.role} credit: ${c.name ?? 'linked account'}`);
    }
  } catch {
    // Labels are an aid, not a gate.
  }
  return reports.map((r) => ({ ...r, targetLabel: labels.get(r.target_id) ?? null }));
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
    mutationFn: async (input: {
      reportId: string;
      adminId: string;
      actioned: boolean;
      target?: { type: ReportTarget; id: string };
    }) => {
      // "Actioned" that leaves the content live is a contradiction the
      // queue used to present: the report read handled while the reported
      // thing stayed up. Take the target down first, then stamp the report.
      const moderatable: ReportTarget[] = ['profile', 'venue', 'series', 'credit'];
      if (input.actioned && input.target && moderatable.includes(input.target.type)) {
        const { error: modError } = await getSupabase().rpc('moderate_content', {
          p_target: input.target.type,
          p_target_id: input.target.id,
          p_approve: false,
        });
        if (modError) {
          throw userError(modError, 'Could not take the content down. The report stays open.');
        }
      }
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
