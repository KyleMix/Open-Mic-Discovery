-- Row level security has to be cheap, not just correct.
--
-- A zero-argument helper written bare in a policy is evaluated once per row
-- considered, which turns every read of the table into one extra query per
-- row. Written as a scalar subquery, the planner hoists it into an InitPlan
-- and runs it once per statement. On 6,700 occurrences that was the
-- difference between 85ms and 38ms, and it grows with the table.
--
-- These assert the shape, because the cost is invisible until the data is
-- big enough to hurt and by then it is in production.
begin;
select plan(3);

-- pg_policies renders a wrapped call as "( SELECT private.is_admin() ...)".
-- A bare one appears as "private.is_admin()" with no SELECT in front.
create temp view unwrapped as
  select tablename, policyname, cmd
  from pg_policies
  where schemaname = 'public'
    and (
      coalesce(qual, '') ~ '(?<!SELECT )private\.is_admin\(\)'
      or coalesce(with_check, '') ~ '(?<!SELECT )private\.is_admin\(\)'
    );

select is(
  (select count(*)::int from unwrapped),
  0,
  'no policy calls private.is_admin() once per row (wrap it: (select private.is_admin()))'
);

-- The same rule for auth.uid(), which was already right everywhere and is
-- worth keeping that way.
select is(
  (select count(*)::int
   from pg_policies
   where schemaname = 'public'
     and (
       coalesce(qual, '') ~ '(?<!SELECT )auth\.uid\(\)'
       or coalesce(with_check, '') ~ '(?<!SELECT )auth\.uid\(\)'
     )),
  0,
  'no policy calls auth.uid() once per row either'
);

-- And prove the wrapping is actually present rather than the tables having
-- quietly lost their admin policies, which would also make the counts zero.
select cmp_ok(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and coalesce(qual, '') like '%SELECT private.is_admin()%'),
  '>=',
  20,
  'the admin policies are still there, hoisted rather than removed'
);

select * from finish();
rollback;
