-- Indexes for the two joins the scheduled jobs make and nobody watches.
--
-- Audit findings F-009 and F-013. Neither is visible at launch scale, which
-- is exactly the problem: these run on a cron timer with no user waiting on
-- them, so the first symptom is the database being slow for everyone else.
--
--   F-009  private.queue_new_mic_alerts (every four hours) and
--          private.queue_weekly_digest (weekly) both call st_dwithin against
--          profiles.home_location, which carries no index at all. The digest
--          is the worse of the two: profiles joined to venues by distance,
--          with neither side bounded.
--   F-013  favorites is keyed (profile_id, series_id). That serves "what has
--          this person favorited" and does nothing for
--          private.queue_favorite_reminders, which runs hourly and joins the
--          other way, favorites to mic_series on series_id.
--
-- Down migration:
-- supabase/migrations/down/20260807000600_retention_indexes.down.sql

-- Partial, because a profile with no geocoded home area is common (the home
-- area may be a city and state that never resolved to a point) and those rows
-- can never satisfy an st_dwithin. Deleted profiles are scrubbed to null too,
-- so they fall out of the index for free.
create index profiles_home_location_gist
  on profiles using gist (home_location)
  where home_location is not null;

create index favorites_series_idx on favorites (series_id);
