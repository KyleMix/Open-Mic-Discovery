import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
import type { Database } from '@/types/database.types';

export type UpcomingNight = Database['public']['Views']['my_upcoming_nights']['Row'];
export type PlanRosterRow = Database['public']['Views']['plan_roster']['Row'];
export type NightAttendance = Database['public']['Views']['occurrence_attendance']['Row'];

/** Whether this person has said they are coming to one night. */
export function useMyPlan(occurrenceId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['plan', 'mine', occurrenceId, userId],
    enabled: !!occurrenceId && !!userId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('attendance_plans')
        .select('occurrence_id')
        .eq('occurrence_id', occurrenceId!)
        .eq('profile_id', userId!)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not check your plan for this night. Try again.');
      }
      return !!data;
    },
  });
}

export function useTogglePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      occurrenceId,
      userId,
      going,
    }: {
      occurrenceId: string;
      userId: string;
      going: boolean;
    }) => {
      const supabase = getSupabase();
      if (!going) {
        const { error } = await supabase
          .from('attendance_plans')
          .delete()
          .eq('occurrence_id', occurrenceId)
          .eq('profile_id', userId);
        if (error) {
          throw userError(error, 'Could not take your plan back. Try again.');
        }
        return;
      }
      const { error } = await supabase
        .from('attendance_plans')
        .insert({ occurrence_id: occurrenceId, profile_id: userId });
      if (error) {
        // The policy refuses nights that have passed or been cancelled, which
        // is what a stale screen tries to do.
        if (error.code === '42501') {
          throw new Error('That night is no longer taking plans.');
        }
        if (error.code === '23505') {
          throw new Error('You are already down as going.');
        }
        throw userError(error, 'Could not save that you are going. Try again.');
      }
    },
    onSuccess: (_data, { going }) => {
      if (going) {
        Haptics.selectionAsync().catch(() => null);
      }
      return queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}

/**
 * Everything this person said yes to, soonest first. Nights that have already
 * happened drop off on their own, so the list is only ever what is ahead.
 */
export function useUpcomingNights(userId: string | undefined) {
  return useQuery({
    queryKey: ['plan', 'upcoming', userId],
    enabled: !!userId,
    queryFn: async (): Promise<UpcomingNight[]> => {
      const { data, error } = await getSupabase()
        .from('my_upcoming_nights')
        .select('*')
        // A mic that started an hour ago is still tonight's mic to the person
        // standing outside it, so the cutoff trails the clock.
        .gte('starts_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
        .order('starts_at');
      if (error) {
        throw userError(error, 'Could not load your nights. Try again.');
      }
      return data;
    },
  });
}

/** Producer-only: the headcount for one night. */
export function useNightAttendance(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['plan', 'attendance', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async (): Promise<NightAttendance | null> => {
      const { data, error } = await getSupabase()
        .from('occurrence_attendance')
        .select('*')
        .eq('occurrence_id', occurrenceId!)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not load the headcount. Try again.');
      }
      return data;
    },
  });
}

/** Producer-only: headcounts for every night of a series, in one round trip. */
export function useSeriesAttendance(seriesId: string | undefined) {
  return useQuery({
    queryKey: ['plan', 'attendance', 'series', seriesId],
    enabled: !!seriesId,
    queryFn: async (): Promise<NightAttendance[]> => {
      const { data, error } = await getSupabase()
        .from('occurrence_attendance')
        .select('*')
        .eq('series_id', seriesId!);
      if (error) {
        throw userError(error, 'Could not load the headcount. Try again.');
      }
      return data;
    },
  });
}

/** Producer-only: who said they are coming, by stage name. */
export function usePlanRoster(occurrenceId: string | undefined) {
  return useQuery({
    queryKey: ['plan', 'roster', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async (): Promise<PlanRosterRow[]> => {
      const { data, error } = await getSupabase()
        .from('plan_roster')
        .select('*')
        .eq('occurrence_id', occurrenceId!)
        .order('created_at');
      if (error) {
        throw userError(error, 'Could not load who is coming. Try again.');
      }
      return data;
    },
  });
}
