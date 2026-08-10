-- The admin read policy on share_events called private.is_admin() bare, so it
-- ran once per row considered instead of once per statement. Every other
-- policy wraps the helper in a scalar subquery so the planner hoists it into
-- an InitPlan; the rls-performance pgTAP suite asserts exactly that shape and
-- caught this one. alter policy keeps the policy in place while fixing the
-- call shape.
alter policy "share events admin select" on public.share_events
  using ((select private.is_admin()));
