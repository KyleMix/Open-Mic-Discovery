-- Grant and RLS coupling tests. Runs under pgTAP inside a rolled-back
-- transaction.
--
-- The grants migration issues `grant all on all tables in schema public to
-- anon, authenticated, service_role` and extends the same to future objects
-- with `alter default privileges`. That is safe only because every table
-- carries row level security with default-deny policies. Row level security
-- is not a second layer here, it is the only layer.
--
-- The consequence is that a table added in a later migration without
-- `enable row level security` is readable and writable by anonymous callers
-- from the moment it exists, and nothing in the schema objects. These tests
-- are that objection.
begin;
select plan(16);

-- ---------------------------------------------------------------------------
-- The exception that proves the rule: spatial_ref_sys.
--
-- Every RLS assertion in this file and in rls.test.sql excludes this table,
-- because it belongs to PostGIS and cannot carry our policies. That exclusion
-- is exactly where the blanket grant bites: no row level security, and until
-- 20260801000700 the API roles held every privilege on it. Deleting from it
-- breaks ST_DWithin and the <-> ordering the whole product runs on.
--
-- So it gets checked by privilege instead of by policy. Nothing else in the
-- schema is allowed to rely on being skipped.
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('anon', 'public.spatial_ref_sys', 'SELECT'),
  'anon can still read spatial_ref_sys, which PostGIS needs for transforms'
);
select ok(
  not has_table_privilege('anon', 'public.spatial_ref_sys', 'DELETE'),
  'anon cannot delete from spatial_ref_sys and break every distance query'
);
select ok(
  not has_table_privilege('anon', 'public.spatial_ref_sys', 'INSERT'),
  'anon cannot insert into spatial_ref_sys'
);
select ok(
  not has_table_privilege('authenticated', 'public.spatial_ref_sys', 'UPDATE'),
  'a signed-in user cannot rewrite a coordinate system definition'
);

-- ---------------------------------------------------------------------------
-- The guard: no table without row level security.
-- ---------------------------------------------------------------------------
-- Named rather than counted, so a failure says which table is exposed instead
-- of only that some number moved.
select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relrowsecurity
        and c.relname <> 'spatial_ref_sys' $$,
  'no table in public is missing row level security'
);

-- RLS with no policy at all is default-deny, which is a legitimate choice for
-- the outbox but an accident anywhere else. This lists the accidents.
select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relrowsecurity
        and c.relname not in ('spatial_ref_sys', 'notification_outbox')
        and not exists (
          select 1 from pg_policy p where p.polrelid = c.oid
        ) $$,
  'every table with row level security also has at least one policy, except the outbox'
);

select is(
  (select count(*)::int from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notification_outbox'),
  0,
  'the outbox stays deliberately policy-free, so the API roles are denied by default'
);

-- ---------------------------------------------------------------------------
-- Why the guard above is load-bearing: the grant really is blanket.
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('anon', 'public.mic_series', 'SELECT'),
  'anon holds a table grant on mic_series, so only row level security limits it'
);
select ok(
  has_table_privilege('anon', 'public.profiles', 'UPDATE'),
  'anon even holds UPDATE on profiles, which only row level security refuses'
);

-- A table created now inherits the same access from `alter default
-- privileges`, with no row level security of its own. Created inside this
-- transaction and rolled back with it, this demonstrates the exposure a new
-- migration would ship by default.
create table public.rls_guard_probe (id uuid primary key default gen_random_uuid());

select is(
  (select relrowsecurity from pg_class
    where oid = 'public.rls_guard_probe'::regclass),
  false,
  'a newly created table has no row level security until a migration enables it'
);
select ok(
  has_table_privilege('anon', 'public.rls_guard_probe', 'SELECT'),
  'and default privileges already grant anon SELECT on it'
);
select ok(
  has_table_privilege('anon', 'public.rls_guard_probe', 'INSERT'),
  'and INSERT, so an unguarded new table is world-writable on creation'
);

-- ---------------------------------------------------------------------------
-- The same guard, for views (20260807000500, audit finding F-008).
--
-- The table guard above does not reach a view: it filters relkind = 'r', and
-- a view is 'v'. That matters more for views than for tables, because a view
-- defaults to security_invoker = off, which means it runs as its owner and
-- bypasses row level security on its base tables entirely. Paired with the
-- blanket grant, a view added without a thought is a world-readable window
-- onto whatever it selects.
--
-- Extension-owned views (PostGIS geometry_columns, pgTAP tap_funky, and
-- friends) are excluded by ownership rather than by name, so installing or
-- removing an extension never needs an edit here.
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'v'
        and not exists (
          select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e'
        )
        and not exists (
          select 1 from unnest(coalesce(c.reloptions, '{}')) o
           where o like 'security_invoker=%'
        ) $$,
  'every view in public states its security_invoker setting instead of inheriting one'
);

-- Stating it is not the same as choosing well. A view that runs as its owner
-- carries its own visibility filter instead of borrowing RLS, and that is a
-- judgement each one has to earn. Naming them here is what makes adding an
-- eleventh a deliberate act rather than a default.
select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'v'
        and exists (
          select 1 from unnest(coalesce(c.reloptions, '{}')) o
           where o = 'security_invoker=off'
        )
        and c.relname not in (
          -- Column-limited public projections. Each carries the deleted,
          -- moderation, and block filters explicitly in its WHERE.
          'public_profiles', 'performer_public', 'producer_public',
          'mic_credit_public',
          -- Counts only, no identities, restricted to publicly visible
          -- listings. Access by construction, same as series_search.
          'occurrence_spots',
          -- Filtered to the series owner, its creator, or an admin.
          'occurrence_attendance',
          -- Exists precisely to read profiles a block hides. Filtered to
          -- `blocker_id = auth.uid()`, so it only ever shows your own list.
          'blocked_profiles'
        ) $$,
  'and every view that runs as its owner is one that was reviewed for it'
);

-- ---------------------------------------------------------------------------
-- Paused listings leave text search too (20260807000500, audit finding F-007).
--
-- ux-decisions.test.sql already holds this line for mics_near. search_mics
-- was the path with no filter and no assertion, which is how it stayed broken
-- through three rewrites of the function around it.
--
-- The seed ships no paused listing, so the condition is created here rather
-- than searched for: an assertion that a paused mic is absent passes for free
-- when there is no paused mic. This runs as postgres, which is the sharper
-- test of the two available: row level security is out of the picture, so the
-- only thing that can exclude the row is the function's own filter.
-- ---------------------------------------------------------------------------
select ok(
  exists (select 1 from search_mics('Rusty Fret') r
           where r.series_id = '20000000-0000-4000-c000-000000000001'),
  'an active listing is findable by name, so the next assertion means something'
);

update mic_series set is_active = false
 where id = '20000000-0000-4000-c000-000000000001';

select is_empty(
  $$ select r.title from search_mics('Rusty Fret') r
      where r.series_id = '20000000-0000-4000-c000-000000000001' $$,
  'and switching it off removes it from search_mics, as it already does from mics_near'
);

select * from finish();
rollback;
