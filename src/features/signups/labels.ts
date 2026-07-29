import type { Database } from '@/types/database.types';

type SignupStatus = Database['public']['Enums']['signup_status'];

/**
 * Plain-language names for signup statuses, shared by the performer's
 * signup card and the producer's roster so the wording never drifts.
 */
export const STATUS_LABELS: Record<SignupStatus, string> = {
  requested: 'In the draw',
  confirmed: 'On the list',
  waitlisted: 'Waitlisted',
  drawn: 'Drawn: on the list',
  performed: 'Performed',
  no_show: 'Marked no-show',
};
