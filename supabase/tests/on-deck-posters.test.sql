-- On-deck flag and poster storage tests.
begin;
select plan(8);

-- Seeded: p1 performer ...0001 has a signup on Rusty Fret (series ...0001),
-- owned by p2 producer ...0002. Force it confirmed for the on-deck flow.
update signups set status = 'confirmed'
where performer_id = '00000000-0000-4000-a000-000000000001';

create temp table target_signup as
  select id from signups
  where performer_id = '00000000-0000-4000-a000-000000000001'
  limit 1;
grant select on target_signup to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Only the producer of the mic controls on deck
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  format('select mark_on_deck(%L)', (select id from target_signup)),
  '42501', null,
  'a performer cannot mark themselves on deck'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format('select mark_on_deck(%L)', (select id from target_signup)),
  'the series owner marks a confirmed performer on deck'
);
select ok(
  (select on_deck_at is not null from signups where id = (select id from target_signup)),
  'on_deck_at is stamped'
);

reset role;
select is(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000001'
     and payload ->> 'on_deck' = 'true'),
  1,
  'flagging on deck enqueued one push for the performer'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  format('select mark_on_deck(%L, false)', (select id from target_signup)),
  'the owner can take a performer off deck'
);
select ok(
  (select on_deck_at is null from signups where id = (select id from target_signup)),
  'on_deck_at clears'
);

-- ---------------------------------------------------------------------------
-- Poster storage policies
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select public from storage.buckets where id = 'posters'),
  true,
  'posters bucket exists and is public'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('posters', '00000000-0000-4000-a000-000000000001/poster.jpg')$$,
  '42501', null,
  'a producer cannot write into another user''s poster folder'
);

select * from finish();
rollback;
