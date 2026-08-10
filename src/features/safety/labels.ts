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
  credit: 'Host or featured artist',
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

type SanctionType = Database['public']['Enums']['sanction_type'];
type SanctionScope = Database['public']['Enums']['sanction_scope'];

const SANCTION_AREA: Record<SanctionScope, string> = {
  all_writes: 'Your account',
  signups: 'Signing up',
  listings: 'Managing listings',
  reporting: 'Reporting',
};

/**
 * The banner line for a live sanction. The reason is written by moderators
 * to be read by the sanctioned person; without this the app showed them
 * nothing but unrelated, wrongly worded failures.
 */
export function sanctionMessage(sanction: {
  type: SanctionType;
  scope: SanctionScope;
  reason: string;
  expires_at: string | null;
}): string {
  if (sanction.type === 'warned') {
    return `A warning from the moderators: ${sanction.reason}`;
  }
  const area = SANCTION_AREA[sanction.scope];
  if (sanction.type === 'suspended') {
    const until = sanction.expires_at
      ? ` until ${new Date(sanction.expires_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}`
      : '';
    return `${area} is suspended${until}. ${sanction.reason}`;
  }
  return `${area} has been disabled by the moderators. ${sanction.reason}`;
}
