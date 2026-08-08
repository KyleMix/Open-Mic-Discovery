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
select plan(7);

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
-- Prove the wrapping is actually present rather than the tables having quietly
-- lost their admin policies, which would also make the count above zero.
--
-- The threshold was 20 until 20260807001500 moved twelve SELECT policies onto
-- private.is_admin_reader(), so the two predicates are counted separately now.
-- That is a better test than the single number was: it pins the split as well as
-- the wrapping, so a policy silently changing which side it is on shows up here.
select cmp_ok(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and coalesce(qual, '') like '%SELECT private.is_admin()%'),
  '>=',
  15,
  'the write-side admin policies are still there, hoisted rather than removed'
);

select is(
  (select count(*)::int
   from pg_policies
   where schemaname = 'public'
     and (
       coalesce(qual, '') ~ '(?<!SELECT )private\.is_admin_reader\(\)'
       or coalesce(with_check, '') ~ '(?<!SELECT )private\.is_admin_reader\(\)'
     )),
  0,
  'no policy calls private.is_admin_reader() once per row'
);

select cmp_ok(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and coalesce(qual, '') like '%SELECT private.is_admin_reader()%'),
  '>=',
  10,
  'and the read-side policies are on the reader predicate, so read_only can see the queue'
);

-- The sanction predicate (20260807001400) is the same shape of hazard: it takes
-- an argument, but the argument is constant for the statement, so the whole call
-- belongs inside a scalar subquery for the same reason.
select is(
  (select count(*)::int
   from pg_policies
   where schemaname = 'public'
     and (
       coalesce(qual, '') ~ '(?<!SELECT )private\.i_am_sanctioned\('
       or coalesce(with_check, '') ~ '(?<!SELECT )private\.i_am_sanctioned\('
     )),
  0,
  'no policy calls private.i_am_sanctioned() once per row either'
);

-- And the same proof that the count above is zero because the calls are wrapped
-- rather than because the sanction checks quietly went away.
select cmp_ok(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') like '%SELECT private.i_am_sanctioned%'
          or coalesce(with_check, '') like '%SELECT private.i_am_sanctioned%')),
  '>=',
  8,
  'and the sanction checks are still on the policies that need them'
);

select * from finish();
rollback;
