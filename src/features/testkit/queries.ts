import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import type { ScenarioKey } from './scenarios';

/**
 * Client bindings for the admin-only test kit RPCs. Every function here is
 * refused server side for anyone who is not an admin, so this module never
 * needs to be defensive about who is calling.
 */

/**
 * Everything PostgREST knows about a failure, in one line.
 *
 * A bare message loses the parts that identify the cause: the SQLSTATE, and
 * the details and hint Postgres attaches to constraint and permission errors.
 * These are developer tools, so the person reading the screen is the person
 * who can act on the code, and hiding it costs a round trip.
 */
function rpcError(
  error: { message: string; details?: string | null; hint?: string | null; code?: string | null },
  fallback: string,
): Error {
  const parts = [error.message || fallback];
  if (error.details) {
    parts.push(error.details);
  }
  if (error.hint) {
    parts.push(error.hint);
  }
  if (error.code) {
    parts.push(`(${error.code})`);
  }
  return new Error(parts.join(' '));
}

export type TestKitLogin = { email: string; name: string };

export type TestKitNight = {
  occurrence_id: string;
  series_id: string;
  title: string;
  starts_at: string;
};

export type TestKitStatus = {
  enabled: boolean;
  password: string;
  counts: Record<string, number>;
  logins: TestKitLogin[];
  next_night: TestKitNight | null;
};

export type ScenarioResult = {
  scenario: string;
  summary: string;
  series_id?: string;
  occurrence_id?: string;
};

/** The device timezone, so "starting in 90 minutes" means where you are. */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
}

const statusKey = ['test-kit', 'status'];

export function useTestKitStatus(isAdmin: boolean) {
  return useQuery({
    queryKey: statusKey,
    enabled: isAdmin,
    queryFn: async (): Promise<TestKitStatus> => {
      const { data, error } = await getSupabase().rpc('test_kit_status');
      if (error) {
        throw rpcError(error, 'Could not read test kit status.');
      }
      return data as unknown as TestKitStatus;
    },
  });
}

/** Anything the kit does can change listings, rosters, and roles at once. */
function useInvalidateEverything() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries();
  };
}

export function useSeedScenario() {
  const invalidate = useInvalidateEverything();
  return useMutation({
    mutationFn: async (scenario: ScenarioKey): Promise<ScenarioResult> => {
      const { data, error } = await getSupabase().rpc('test_kit_seed_scenario', {
        p_scenario: scenario,
        p_timezone: deviceTimezone(),
      });
      if (error) {
        throw rpcError(error, 'Could not build that scenario.');
      }
      return data as unknown as ScenarioResult;
    },
    onSuccess: invalidate,
  });
}

export function useFillRoster() {
  const invalidate = useInvalidateEverything();
  return useMutation({
    mutationFn: async ({ occurrenceId, count }: { occurrenceId: string; count: number }) => {
      const { data, error } = await getSupabase().rpc('test_kit_fill_roster', {
        p_occurrence_id: occurrenceId,
        p_count: count,
      });
      if (error) {
        throw rpcError(error, 'Could not add performers.');
      }
      return data as unknown as { added: number };
    },
    onSuccess: invalidate,
  });
}

export function useShiftOccurrence() {
  const invalidate = useInvalidateEverything();
  return useMutation({
    mutationFn: async ({ occurrenceId, minutes }: { occurrenceId: string; minutes: number }) => {
      const { error } = await getSupabase().rpc('test_kit_shift_occurrence', {
        p_occurrence_id: occurrenceId,
        p_minutes_from_now: minutes,
      });
      if (error) {
        throw rpcError(error, 'Could not move that night.');
      }
    },
    onSuccess: invalidate,
  });
}

export function useSetTestRoles() {
  const invalidate = useInvalidateEverything();
  return useMutation({
    mutationFn: async ({ performer, producer }: { performer: boolean; producer: boolean }) => {
      const { error } = await getSupabase().rpc('test_kit_set_roles', {
        p_performer: performer,
        p_producer: producer,
      });
      if (error) {
        throw rpcError(error, 'Could not change your roles.');
      }
    },
    onSuccess: invalidate,
  });
}

export function useSetTestKitEnabled() {
  const invalidate = useInvalidateEverything();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await getSupabase().rpc('test_kit_set_enabled', { p_enabled: enabled });
      if (error) {
        throw rpcError(error, 'Could not switch the test kit.');
      }
    },
    onSuccess: invalidate,
  });
}

export function useResetTestData() {
  const invalidate = useInvalidateEverything();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabase().rpc('test_kit_reset');
      if (error) {
        throw rpcError(error, 'Could not remove the test data.');
      }
      return data as unknown as { removed: Record<string, number> };
    },
    onSuccess: invalidate,
  });
}
