-- EULA versioning. The acceptance gate in src/app/_layout.tsx reads the newest
-- row by published_at, so the rebrand is only live if 1.1 sorts newest and
-- carries the new name. 1.0 must survive: profiles reference it by foreign key.
begin;
select plan(5);

select is(
  (select body_md like '%Open Mic Explorer%' from eula_versions where version = '1.1'),
  true,
  'EULA 1.1 names the app Open Mic Explorer'
);

select is(
  (select body_md like '%legal@openmicexplorer.app%' from eula_versions where version = '1.1'),
  true,
  'EULA 1.1 carries the rebranded contact address'
);

select is(
  (select version from eula_versions order by published_at desc, version desc limit 1),
  '1.1',
  'EULA 1.1 is the version the acceptance gate serves'
);

-- Historical record: 1.0 is what existing accounts accepted and is referenced
-- by profiles.eula_version, so it is never rewritten or removed.
select is(
  (select count(*)::int from eula_versions where version = '1.0'),
  1,
  'EULA 1.0 is retained for accounts that accepted it'
);

select is(
  (select body_md like '%Open Mic Finder%' from eula_versions where version = '1.0'),
  true,
  'EULA 1.0 keeps the original text it was accepted under'
);

select * from finish();
rollback;
