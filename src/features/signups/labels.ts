import type { Database } from '@/types/database.types';

type SignupStatus = Database['public']['Enums']['signup_status'];

/**
 * Producer-voice status names for the roster. The performer-voice map
 * (STATUS_LABELS in signup-card) says "You are in"; a host reading the
 * list needs the third person.
 */
export const ROSTER_STATUS_LABELS: Record<SignupStatus, string> = {
  requested: 'In the draw',
  confirmed: 'On the list',
  waitlisted: 'Waitlisted',
  drawn: 'Drawn: on the list',
  performed: 'Performed',
  no_show: 'Marked no-show',
};
