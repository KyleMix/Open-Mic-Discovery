-- Defense in depth: take back grants that nothing legitimate uses.
--
-- The schema's access model is "row level security is the only layer": the
-- grants migration (20260728001200) issues a blanket
-- `grant all on all tables ... to anon, authenticated` and extends it to future
-- objects with `alter default privileges`, and every table carries a
-- default-deny policy behind it (grants-and-rls.test.sql is that objection).
-- report_triage and user_sanctions already revoke the blanket write back with a
-- written rationale; this migration does the same for the remaining places
-- where an API role holds a write it can never legitimately use, so that a
-- single missing or wrong policy is not the only thing standing between a
-- caller and a write.
--
-- Down migration: supabase/migrations/down/20260811000300_defense_in_depth_revokes.down.sql

-- Finding 6. private.delete_account_for(uuid) checks no caller identity of its
-- own (its guards are "uuid not null" and "a live profile exists"); the two
-- wrappers do. It holds EXECUTE for authenticated only through the blanket
-- grant plus PUBLIC's default, and is safe today only because `private` is not
-- a PostgREST-exposed schema. That is one config line away from an
-- "any authenticated user deletes any account by uuid" primitive. The wrappers
-- delete_account() and delete_account_web() are SECURITY DEFINER owned by a
-- superuser, so they keep calling it; the codebase already revokes
-- drain_notification_outbox, admin_bit_for, new_invite_token, and
-- invite_token_hash for exactly this reason.
revoke all on function private.delete_account_for(uuid) from public, anon, authenticated;

-- Finding 7. Write grants on tables where the API role has no policy that could
-- ever let the write through. RLS already denies these, so this closes surface
-- rather than fixing a live hole.
--
-- anon has no write policy on these three (every write policy is
-- authenticated-only), and holds no session to satisfy one, so it can lose the
-- write grant with no behavior change. authenticated keeps its grants here
-- because its policies are the real write path.
revoke insert, update, delete on public.connections from anon;
revoke insert, update, delete on public.mic_credits from anon;
revoke insert, update, delete on public.attendance_plans from anon;

-- series_search has no write policy at all: every write goes through the
-- SECURITY DEFINER sync functions (owned by a superuser, so unaffected by these
-- grants). Neither API role needs to write it, so both lose the grant. The
-- SELECT grant stays, because the search RPCs read it as the caller.
revoke insert, update, delete on public.series_search from anon, authenticated;

-- share_events is deliberately NOT included: anon holds a real INSERT policy
-- for guest shares (a signed-out browser can share a mic), so its write grant
-- is load-bearing.
