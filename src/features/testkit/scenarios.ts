/**
 * The test kit catalog.
 *
 * Each entry is one lane: one button that builds the situation and then puts
 * you inside it. Nothing here asks you to set something up and then go find
 * it, because that is the step where a test gets abandoned. Back out of the
 * screen it lands on and you are here again, ready for the next one.
 *
 * Keys must match the scenario names the migration understands (the newest
 * definition of test_kit_seed_scenario, currently in
 * supabase/migrations/20260801000300_on_deck_and_live_testing.sql).
 */

export type ScenarioKey =
  'live' | 'tonight' | 'lottery' | 'week' | 'unclaimed' | 'stale' | 'moderation' | 'performer';

/**
 * Where a lane ends up. Resolved against the ids the scenario returns, so a
 * scenario that builds no night can never be sent to a night screen.
 */
export type Destination =
  /** Running the show: needs the night to be inside the live window. */
  | { screen: 'live' }
  /** The night's list: the draw, reordering, marking people done. */
  | { screen: 'roster' }
  /** One listing's public page. */
  | { screen: 'mic' }
  /** The browse list, where several listings are compared side by side. */
  | { screen: 'discover' }
  /** The moderation queue. */
  | { screen: 'moderation' }
  /** The performer's own upcoming nights. */
  | { screen: 'going' };

export type Scenario = {
  key: ScenarioKey;
  /** The verb on the button. Says what you are about to be doing. */
  label: string;
  /** What lands in the database, in plain language. */
  detail: string;
  /** What to actually do once you are there. Read this before tapping. */
  tryThis: string;
  destination: Destination;
};

export const scenarios: Scenario[] = [
  {
    key: 'live',
    label: 'Run a live show',
    detail:
      'A night already running: two performed, one no-show, somebody on stage, the next on deck, two to go, two waiting.',
    tryThis:
      'Start the set and watch the clock count the allotted set down. Mark someone done and the next one moves up on deck by itself. Put a waiting performer on the list.',
    destination: { screen: 'live' },
  },
  {
    key: 'tonight',
    label: 'Work tonight’s list',
    detail: 'A mic you run, starting soon, with 6 performers already signed up.',
    tryThis:
      'Reorder the list by dragging, mark someone performed or a no-show, and use the megaphone to put somebody on deck.',
    destination: { screen: 'roster' },
  },
  {
    key: 'lottery',
    label: 'Run a name draw',
    detail: 'Your name-draw mic tonight: 9 names in the hat for 5 slots, nothing drawn yet.',
    tryThis:
      'Run the draw and watch the shuffle. Five become drawn with slot numbers, the rest waitlist, and each of them gets a push.',
    destination: { screen: 'roster' },
  },
  {
    key: 'week',
    label: 'Browse and filter',
    detail:
      'Six listings over the next week: every discipline, free and paid, walking distance out to a drive.',
    tryThis:
      'Filter by discipline and by day, switch to the map, and check the distances read in miles.',
    destination: { screen: 'discover' },
  },
  {
    key: 'unclaimed',
    label: 'Claim a listing',
    detail: 'An unclaimed mic near you, plus a pending claim from somebody else.',
    tryThis:
      'Claim it with a verification note. Then come back here and open the moderation queue to approve or reject the claim already waiting.',
    destination: { screen: 'mic' },
  },
  {
    key: 'stale',
    label: 'Compare freshness',
    detail: 'Three listings confirmed 2 days ago, 30 days ago, and never.',
    tryThis:
      'Look at the three badges side by side: green, amber, and gray. Open one and tap Confirm accurate to watch it go green.',
    destination: { screen: 'discover' },
  },
  {
    key: 'moderation',
    label: 'Work the queue',
    detail: 'A held profile, a held listing, an abuse report, and a data-quality flag.',
    tryThis: 'Approve one, reject one, and resolve the report and the flag.',
    destination: { screen: 'moderation' },
  },
  {
    key: 'performer',
    label: 'Be a performer',
    detail: 'You on three lists (confirmed, waitlisted, requested), following all three.',
    tryThis:
      'Check each signup card reads the right status, then withdraw from one and watch it leave.',
    destination: { screen: 'going' },
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

/**
 * The route a lane ends on, or null when the scenario did not produce what
 * that screen needs. Returning null rather than a broken path keeps a
 * half-built scenario from navigating into a screen with nothing in it.
 */
export function destinationPath(
  destination: Destination,
  ids: { seriesId?: string; occurrenceId?: string },
): string | null {
  switch (destination.screen) {
    case 'live':
      return ids.occurrenceId ? `/producer/live/${ids.occurrenceId}` : null;
    case 'roster':
      return ids.occurrenceId ? `/producer/night/${ids.occurrenceId}` : null;
    case 'mic':
      return ids.seriesId ? `/mic/${ids.seriesId}` : null;
    case 'discover':
      return '/(tabs)';
    case 'moderation':
      return '/admin';
    case 'going':
      return '/(tabs)/going';
  }
}
