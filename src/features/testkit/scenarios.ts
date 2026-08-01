/**
 * The test kit scenario catalog.
 *
 * Each entry is one tap in Testing tools and one call to the
 * test_kit_seed_scenario RPC. Keys must match the scenario names the
 * migration understands (the newest definition of test_kit_seed_scenario,
 * in supabase/migrations/20260801000300_on_deck_and_live_testing.sql).
 */

export type ScenarioKey =
  'live' | 'tonight' | 'lottery' | 'week' | 'unclaimed' | 'stale' | 'moderation' | 'performer';

export type Scenario = {
  key: ScenarioKey;
  label: string;
  /** What lands in the database, in plain language. */
  detail: string;
  /** What this is worth checking, so the button has a reason to exist. */
  checks: string;
};

export const scenarios: Scenario[] = [
  {
    key: 'live',
    label: 'A show already running',
    detail:
      'Started 20 minutes ago: two performed, one no-show, somebody on stage, the next one on deck, two more to go, and a full list with two waiting.',
    checks: 'Live mode from the middle of a night, which is the only place it gets used.',
  },
  {
    key: 'tonight',
    label: 'A mic of mine, starting soon',
    detail: 'One listing you own, starting in 90 minutes, with 6 performers already on the list.',
    checks: 'Night-of roster, reordering, on deck, realtime, marking performed.',
  },
  {
    key: 'lottery',
    label: 'A lottery waiting to be drawn',
    detail: 'Your lottery mic in 3 hours: 9 names in the hat for 5 slots, nothing drawn yet.',
    checks: 'The draw animation, who gets in, who waitlists, the pushes that follow.',
  },
  {
    key: 'week',
    label: "A week of other people's mics",
    detail:
      'Six listings over the next seven days: every discipline, free and paid, walking distance out to a drive.',
    checks: 'Discovery filters, sorting, the map, distances, signup method labels.',
  },
  {
    key: 'unclaimed',
    label: 'A listing to claim',
    detail: 'One unclaimed mic near you, plus somebody else already asking for it.',
    checks: 'Claiming with a verification note, and the admin claim queue.',
  },
  {
    key: 'stale',
    label: 'Three freshness states',
    detail: 'Listings confirmed 2 days ago, 30 days ago, and never confirmed at all.',
    checks: 'The last-confirmed badge in green, amber, and gray, side by side.',
  },
  {
    key: 'moderation',
    label: 'A full moderation queue',
    detail: 'A held profile, a held listing, an abuse report, and a data-quality flag.',
    checks: 'The queue, approve and reject, resolving reports and flags.',
  },
  {
    key: 'performer',
    label: 'Me, on three lists',
    detail: 'Signs you up for three mics (confirmed, waitlisted, requested) and follows all three.',
    checks: 'The performer side: signup cards, favorites, day-of reminders.',
  },
];

/** Minutes offered by the time machine, shortest first. */
export const shiftOffsets = [5, 15, 30, 60, 180] as const;

export function shiftLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}
