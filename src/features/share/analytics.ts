import { getSupabase } from '@/lib/supabase';
import type { ShareIntent } from '@/features/share/captions';

export type ShareAction =
  | 'sheet_open'
  | 'intent_switch'
  | 'share_completed'
  | 'copy_caption'
  | 'save_image'
  | 'story_share'
  | 'poster_share';

/**
 * Fire-and-forget write to the share_events table. Telemetry must never
 * cost the person anything: a failed insert (offline, rate limited) is
 * swallowed, because the share itself is the thing that matters.
 */
export function recordShareEvent(event: {
  seriesId: string;
  occurrenceId: string | null;
  profileId: string | null;
  intent: ShareIntent;
  action: ShareAction;
  channel?: string | null;
}): void {
  void getSupabase()
    .from('share_events')
    .insert({
      series_id: event.seriesId,
      occurrence_id: event.occurrenceId,
      profile_id: event.profileId,
      intent: event.intent,
      action: event.action,
      channel: event.channel ?? null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * An app invite has no mic: series_id stays null and the intent is
 * 'invite', which the share_events check constraint permits for exactly
 * this action. Same fire-and-forget contract as recordShareEvent.
 */
export function recordInviteEvent(event: {
  profileId: string | null;
  action: 'app_invite';
  channel?: string | null;
}): void {
  void getSupabase()
    .from('share_events')
    .insert({
      series_id: null,
      occurrence_id: null,
      profile_id: event.profileId,
      intent: 'invite',
      action: event.action,
      channel: event.channel ?? null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
