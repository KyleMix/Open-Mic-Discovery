-- Ending a show.
--
-- The risk worth testing is who can do it. end_show is SECURITY DEFINER, so
-- without its own ownership check any signed-in account could close down
-- somebody else's night from across the country.
begin;
select plan(8);

insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000fa', 'live venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000fa', '10000000-0000-4000-b000-0000000000fa',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'live test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
   '23:59', 'UTC', 'first_come', '30 days', 10, 'approved');

create temp table night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000fa'
    and starts_at > now() order by starts_at limit 1;
grant select on night to public;

select has_column('public', 'mic_occurrences', 'live_ended_at',
                  'a night records when its show ended');
select is(
  (select live_ended_at from mic_occurrences where id = (select id from night)),
  null::timestamptz,
  'and starts with no end on it'
);

-- A performer on the list, flagged on deck.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id) select id, auth.uid() from night;
reset role;
update signups set on_deck_at = now() where occurrence_id = (select id from night);

-- Someone who does not run this mic must not be able to close it down.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select end_show((select id from night))$$,
  '42501',
  null,
  'a performer cannot end somebody else"s show'
);

-- The producer can.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select isnt(
  (select end_show((select id from night))),
  null::timestamptz,
  'the producer ends the show and gets the time back'
);
reset role;
select isnt(
  (select live_ended_at from mic_occurrences where id = (select id from night)),
  null::timestamptz,
  'and it is recorded on the night, not on a device'
);

-- On deck is a promise that you are about to be called up. After the show it
-- is not true of anybody.
select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from night) and on_deck_at is not null),
  0,
  'ending the show takes everyone off deck'
);

-- A second tap must not move the end of the night to now.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
create temp table first_end as
  select live_ended_at from mic_occurrences where id = (select id from night);
select end_show((select id from night));
reset role;
select is(
  (select live_ended_at from mic_occurrences where id = (select id from night)),
  (select live_ended_at from first_end),
  'ending a show twice keeps the first time'
);

-- A host who ended the night by mistake, with people still waiting to go up,
-- needs a way back in. That is a plain column write the owner policy allows.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
update mic_occurrences set live_ended_at = null where id = (select id from night);
reset role;
select is(
  (select live_ended_at from mic_occurrences where id = (select id from night)),
  null::timestamptz,
  'and the producer can reopen a show they ended by accident'
);

select * from finish();
rollback;
