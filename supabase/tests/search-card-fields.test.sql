-- search_mics returns everything the discovery card draws, so a search result
-- and a nearby result render identically instead of swapping formats.
begin;
select plan(6);

set local role anon;

-- The two columns the card needed and search did not return. Checked against
-- the declared result type, since has_column only understands relations.
select ok(
  pg_get_function_result(
    'search_mics(text,double precision,double precision,integer)'::regprocedure
  ) like '%neighborhood text%',
  'search_mics returns neighborhood'
);
select ok(
  pg_get_function_result(
    'search_mics(text,double precision,double precision,integer)'::regprocedure
  ) like '%poster_url text%',
  'search_mics returns poster_url'
);

-- Every field the card reads, checked against a seeded mic so a future edit to
-- the function cannot quietly drop one and strip the card back down.
select is(
  (select count(*)::int
   from search_mics('Rusty Fret') r
   where r.series_id is not null
     and r.title is not null
     and r.disciplines is not null
     and r.signup_method is not null
     and r.cost_cents is not null
     and r.rrule is not null
     and r.start_time is not null
     and r.timezone is not null
     and r.last_confirmed_at is not null
     and r.venue_name is not null),
  1,
  'search results carry every field the discovery card renders'
);

-- Same mic through both paths must agree, or the two lists disagree on screen.
select is(
  (select r.title from search_mics('Rusty Fret') r),
  (select n.title from mics_near(47.6062, -122.3321, 50000) n where n.title = 'Rusty Fret Open Mic'),
  'search and nearby report the same title for the same mic'
);

select is(
  (select r.signup_method::text from search_mics('Rusty Fret') r),
  (select n.signup_method::text from mics_near(47.6062, -122.3321, 50000) n
   where n.title = 'Rusty Fret Open Mic'),
  'search and nearby agree on the signup method'
);

-- Row level security still applies: the function is SECURITY INVOKER, so a
-- soft-deleted listing must not reappear through search.
select is(
  (select count(*)::int from search_mics('Rusty Fret') r
   join mic_series s on s.id = r.series_id
   where s.deleted_at is not null),
  0,
  'search never returns a soft-deleted listing'
);

select * from finish();
rollback;
