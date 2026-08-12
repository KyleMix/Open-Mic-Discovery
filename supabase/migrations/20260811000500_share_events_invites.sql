-- App invites and signup posters join share telemetry.
--
-- Word-of-mouth features (owner brief, 2026-08-11): anyone can send an
-- invite to join the app, and a host can share a printable signup poster
-- for a specific mic. Both are shares, so they land in share_events
-- rather than a parallel table. Two consequences for the schema:
--
-- 1. An app invite has no mic, so series_id relaxes from NOT NULL to a
--    paired check: exactly the 'app_invite' action carries a null series
--    and a null series appears on no other action. The invite likewise is
--    the only action with the 'invite' intent, so a malformed writer
--    cannot smuggle an unattributed mic share past the series index.
-- 2. The action list gains 'poster_share' (a host shared or saved the
--    signup poster; series_id present as ever) and 'app_invite'.
--
-- Everything else about the table holds: append-only for API roles,
-- write-only (admin-only select), self-or-null attribution, rate limited,
-- swept at 180 days. The insert policy needs no edit because it never
-- mentioned series_id.

alter table share_events alter column series_id drop not null;

alter table share_events drop constraint share_events_intent_check;
alter table share_events add constraint share_events_intent_check
  check (intent in ('performer', 'producer', 'neutral', 'invite'));

alter table share_events drop constraint share_events_action_check;
alter table share_events add constraint share_events_action_check
  check (action in
    ('sheet_open', 'intent_switch', 'share_completed',
     'copy_caption', 'save_image', 'story_share',
     'poster_share', 'app_invite'));

-- The pairings, both directions each: no mic-less mic share, no
-- mic-carrying invite, and 'invite' means exactly the invite action.
alter table share_events add constraint share_events_invite_shape
  check (
    ((action = 'app_invite') = (series_id is null))
    and ((action = 'app_invite') = (intent = 'invite'))
  );
