import type { Database } from '@/types/database.types';

type ReportReason = Database['public']['Enums']['report_reason'];
type ReportTarget = Database['public']['Enums']['report_target'];
type FlagReason = Database['public']['Enums']['flag_reason'];

/**
 * Plain-language names for safety enums, shared by the report modal, the
 * listing flag modal, and the moderation queue so no raw enum value ever
 * reaches a screen. Record types keep these exhaustive at compile time.
 */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam or scam',
  harassment: 'Harassment or bullying',
  hate: 'Hate or discrimination',
  sexual_content: 'Sexual content',
  violence_threat: 'Violence or threats',
  impersonation: 'Impersonation',
  illegal: 'Illegal activity',
  other: 'Something else',
};

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = {
  series: 'Listing',
  venue: 'Venue',
  profile: 'Profile',
  occurrence: 'Night',
};

export const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  wrong_time: 'Time or day is wrong',
  wrong_venue: 'Venue info is wrong',
  wrong_cost: 'Cost is wrong',
  not_happening: 'A listed night is not happening',
  permanently_dead: 'This mic is dead',
  duplicate: 'Duplicate listing',
  other: 'Something else',
};
