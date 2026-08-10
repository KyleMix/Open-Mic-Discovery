-- The realtime layer's shape, pinned: which tables broadcast, and that
-- signup deletes carry enough of the old row for an occurrence filter to
-- match (the producer roster's withdrawal events depend on it).
begin;
select plan(3);

select is(
  (select relreplident::text from pg_class where oid = 'public.signups'::regclass),
  'f',
  'signups uses full replica identity so delete events carry the occurrence id'
);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'mic_series'
  ),
  'mic_series broadcasts changes'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'mic_occurrences'
  ),
  'mic_occurrences broadcasts changes'
);

select * from finish();
rollback;
