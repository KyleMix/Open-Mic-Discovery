-- EULA versioning across the rebrand. The acceptance gate in
-- src/app/_layout.tsx reads the newest row by published_at, so the rename is
-- only live if 1.2 sorts newest and carries the new name. 1.0 and 1.1 must
-- survive: profiles.eula_version references them by foreign key.
begin;
select plan(7);

select is(
  (select body_md like '%Open Mic Explorer%' from eula_versions where version = '1.2'),
  true,
  'EULA 1.2 names the app Open Mic Explorer'
);

-- The operative clauses have to name the new app. The old name survives in
-- exactly one place, the line explaining what 1.2 replaced, so this checks the
-- clauses rather than the whole body.
select is(
  (select body_md like '%Producers, not Open Mic Explorer, run the events%'
     and body_md like '%at least 18 years old to use Open Mic Explorer%'
   from eula_versions where version = '1.2'),
  true,
  'EULA 1.2 names Open Mic Explorer in the operative clauses'
);

-- 1.2 carries 1.1 forward, so the raised age gate has to survive the rename.
select is(
  (select body_md like '%at least 18 years old%' from eula_versions where version = '1.2'),
  true,
  'EULA 1.2 keeps the 18+ age gate introduced in 1.1'
);

select is(
  (select version from eula_versions order by published_at desc, version desc limit 1),
  '1.3',
  'EULA 1.3 is the version the acceptance gate serves'
);

-- 1.3 moved the web addresses to the publisher domain and changed nothing
-- else: operative clauses, the 18+ gate, and the deletion promise survive.
select is(
  (select body_md like '%stonedgoose.com/openmic/delete-account%'
     and body_md like '%legal@stonedgoose.com%'
     and body_md like '%at least 18 years old to use Open Mic Explorer%'
     and body_md like '%Producers, not Open Mic Explorer, run the events%'
   from eula_versions where version = '1.3'),
  true,
  'EULA 1.3 carries the agreement forward with the new web home'
);

-- Historical record: earlier versions are what existing accounts accepted and
-- are referenced by profiles.eula_version, so they are never rewritten.
select is(
  (select count(*)::int from eula_versions where version in ('1.0', '1.1', '1.2')),
  3,
  'earlier EULA versions are retained for accounts that accepted them'
);

select is(
  (select body_md like '%Open Mic Finder%' from eula_versions where version = '1.1'),
  true,
  'EULA 1.1 keeps the original text it was accepted under'
);

select * from finish();
rollback;
