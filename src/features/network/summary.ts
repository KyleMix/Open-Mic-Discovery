import type { ConnectionRow } from '@/features/network/queries';

export type SplitConnections = {
  /** Requests waiting on this person's answer. */
  requests: ConnectionRow[];
  /** Requests this person sent that have not been answered. */
  sent: ConnectionRow[];
  /** The network itself. */
  connected: ConnectionRow[];
};

/**
 * One query feeds three sections; the split is by who still owes an answer.
 * Rows the view could not resolve a counterpart for (a profile that vanished
 * between queries) drop out here rather than rendering a nameless card.
 */
export function splitConnections(rows: ConnectionRow[]): SplitConnections {
  const usable = rows.filter((r) => r.other_id !== null && r.stage_name !== null);
  return {
    requests: usable.filter((r) => r.status === 'pending' && r.i_requested === false),
    sent: usable.filter((r) => r.status === 'pending' && r.i_requested === true),
    connected: usable.filter((r) => r.status === 'accepted'),
  };
}

/** What this person does, for the line under their name. */
export function roleLabel(row: { is_performer: boolean | null; is_producer: boolean | null }) {
  if (row.is_performer && row.is_producer) {
    return 'Performer and producer';
  }
  if (row.is_producer) {
    return 'Runs a mic';
  }
  if (row.is_performer) {
    return 'Performer';
  }
  return 'Member';
}
