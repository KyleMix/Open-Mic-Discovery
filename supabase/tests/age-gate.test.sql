-- Server-side age gate: a birth year implying an age below 18 is rejected
-- by the database, not just by client validation.
begin;
select plan(7);

-- A fresh auth user with no profile yet.
insert into auth.users (id, email)
values ('00000000-0000-4000-a000-0000000000b1', 'age-gate@demo.openmicexplorer.local');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);

-- Under the gate: rejected server side.
select throws_ok(
  format($sql$
    insert into profiles (id, handle, display_name, home_city, home_region,
                          birth_year, is_performer, eula_version)
    values ('00000000-0000-4000-a000-0000000000b1', 'too_young', 'Too Young',
            'Seattle', 'WA', %s, true, '1.1')
  $sql$, extract(year from now())::int - 17),
  '23514', null,
  'a birth year implying age 17 is rejected server side'
);

-- Missing birth year: rejected server side.
select throws_ok(
  $$insert into profiles (id, handle, display_name, home_city, home_region,
                          is_performer, eula_version)
    values ('00000000-0000-4000-a000-0000000000b1', 'no_year', 'No Year',
            'Seattle', 'WA', true, '1.1')$$,
  '23514', 'birth year is required',
  'a profile without a birth year is rejected server side'
);

-- Exactly at the gate: allowed.
select lives_ok(
  format($sql$
    insert into profiles (id, handle, display_name, home_city, home_region,
                          birth_year, is_performer, eula_version)
    values ('00000000-0000-4000-a000-0000000000b1', 'just_of_age', 'Just Of Age',
            'Seattle', 'WA', %s, true, '1.1')
  $sql$, extract(year from now())::int - 18),
  'a birth year implying age 18 is accepted'
);

-- Editing to an under-gate year later is also rejected.
select throws_ok(
  format($sql$
    update profiles set birth_year = %s
    where id = '00000000-0000-4000-a000-0000000000b1'
  $sql$, extract(year from now())::int - 17),
  '23514', null,
  'updating the birth year below the gate is rejected server side'
);

-- Whatever the newest EULA is, it has to state the 18 requirement. Asserted
-- against the newest row rather than a pinned version so a later EULA cannot
-- quietly drop the age clause. Which version is newest is eula.test.sql's job.
reset role;
select ok(
  (select body_md like '%at least 18 years old%'
   from eula_versions order by published_at desc, version desc limit 1),
  'the newest EULA states the 18 age requirement'
);
select ok(
  (select body_md like '%at least 18 years old%'
   from eula_versions where version = '1.1'),
  'EULA 1.1 states the 18 age requirement'
);

-- Seed and service-role writes stay exempt: the anonymization update inside
-- account deletion clears birth_year without tripping the gate.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);
select lives_ok(
  $$select delete_account()$$,
  'account deletion still works with the age gate installed'
);

select * from finish();
rollback;
