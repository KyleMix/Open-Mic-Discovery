-- Spotify and Apple Music links on every profile.
--
-- Musicians are a first-class discipline here, and for a musician the link
-- that matters is where the music is. Both are stored as full https URLs
-- rather than handles: neither service has a stable public username format
-- the way Instagram and TikTok do, and both hand out share links that already
-- carry the artist id.
--
-- The constraints match link_youtube and link_website exactly, so anything
-- normalizeUrl produces on the client is accepted here.

alter table public.profiles
  add column link_spotify text
    check (link_spotify ~ '^https://' and char_length(link_spotify) <= 200),
  add column link_apple_music text
    check (link_apple_music ~ '^https://' and char_length(link_apple_music) <= 200);

-- Appended at the end so this is a replace rather than a drop. Dropping
-- public_profiles cascades to performer_public, producer_public and
-- signup_roster, which is a much larger change than adding two columns.
-- security_invoker stays off, as it was. The profiles table denies non-owner
-- selects outright, because row level security cannot hide columns, so this
-- view exists to run as its owner and expose only the safe subset. Turning
-- invoker semantics on makes the view obey the caller's RLS instead, and
-- anonymous discovery immediately sees nothing at all.
create or replace view public.public_profiles
with (security_invoker = off) as
  select
    p.id,
    p.handle,
    p.stage_name,
    p.avatar_url,
    p.bio,
    p.is_performer,
    p.is_producer,
    p.created_at,
    p.link_instagram,
    p.link_tiktok,
    p.link_youtube,
    p.link_website,
    p.link_spotify,
    p.link_apple_music
  from public.profiles p
  where p.deleted_at is null
    and p.moderation_status = 'approved'
    and (auth.uid() is null or not private.is_blocked_pair(auth.uid(), p.id));
