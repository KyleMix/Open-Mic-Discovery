-- Revert: drop the search and moderation-queue indexes. The pg_trgm extension
-- is left installed because 20260801000800 created it and other indexes need it.

drop index if exists listing_flags_open_idx;
drop index if exists mic_credits_pending_idx;
drop index if exists mic_series_pending_idx;
drop index if exists venues_pending_idx;
drop index if exists profiles_pending_idx;
drop index if exists profiles_stage_name_trgm;
drop index if exists profiles_handle_trgm;
