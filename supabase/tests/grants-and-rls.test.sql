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
select plan(8);

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

select * from finish();
rollback;
