-- Reverses 20260811000500_share_events_invites.sql.
--
-- Invite rows have no series and cannot satisfy the restored NOT NULL;
-- they are telemetry with a 180 day life, so the down path deletes them
-- rather than inventing a series to hang them on. Poster shares keep
-- their rows but must rejoin the old action list, so they are deleted
-- too. Says so out loud: this loses those events.

delete from share_events where action in ('app_invite', 'poster_share');

alter table share_events drop constraint share_events_invite_shape;

alter table share_events drop constraint share_events_action_check;
alter table share_events add constraint share_events_action_check
  check (action in
    ('sheet_open', 'intent_switch', 'share_completed',
     'copy_caption', 'save_image', 'story_share'));

alter table share_events drop constraint share_events_intent_check;
alter table share_events add constraint share_events_intent_check
  check (intent in ('performer', 'producer', 'neutral'));

alter table share_events alter column series_id set not null;
