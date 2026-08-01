import type { Database } from '@/types/database.types';

type SignupStatus = Database['public']['Enums']['signup_status'];

export type LiveRow = {
  id: string | null;
  status: SignupStatus | null;
  slot_position: number | null;
  created_at: string | null;
  stage_name: string | null;
  handle: string | null;
  performer_id: string | null;
  on_deck_at: string | null;
};

export type LiveOrder = {
  /** The running list, in the order they go up. */
  order: LiveRow[];
  current: LiveRow | null;
  next: LiveRow | null;
  /**
   * The one after next. On deck runs a set ahead: when the night moves on,
   * the person stepping up is already on stage, and it is the one behind them
   * who needs telling to get ready.
   */
  afterNext: LiveRow | null;
  done: number;
};

/** Statuses that put someone in the running order at all. */
const IN_THE_ROOM: SignupStatus[] = ['confirmed', 'drawn', 'performed', 'no_show'];
const FINISHED: SignupStatus[] = ['performed', 'no_show'];

/**
 * Who is on stage and who is up next, derived from the list itself.
 *
 * Nothing about "where we are in the night" is held on the device. The host's
 * phone dies, or they hand the running order to someone else halfway through,
 * and the answer is still the same: the first person not yet marked done is
 * the one on stage. Waitlisted names are not in here at all until the host
 * promotes them.
 */
export function liveOrder(rows: LiveRow[]): LiveOrder {
  const order = rows
    .filter((r) => r.status != null && IN_THE_ROOM.includes(r.status))
    .sort((a, b) => {
      // A performer with no slot yet goes to the back rather than to the
      // front, which is where a plain numeric compare on null would put them.
      const ap = a.slot_position ?? Number.MAX_SAFE_INTEGER;
      const bp = b.slot_position ?? Number.MAX_SAFE_INTEGER;
      if (ap !== bp) {
        return ap - bp;
      }
      return (a.created_at ?? '').localeCompare(b.created_at ?? '');
    });

  const remaining = order.filter((r) => r.status != null && !FINISHED.includes(r.status));
  return {
    order,
    current: remaining[0] ?? null,
    next: remaining[1] ?? null,
    afterNext: remaining[2] ?? null,
    done: order.length - remaining.length,
  };
}

export function performerName(row: LiveRow | null): string {
  return row?.stage_name ?? row?.handle ?? 'Performer';
}
