-- Withdrawal covers reservations, never the record of the night
-- (20260810001000): a performed or no_show row cannot be deleted by its
-- subject, while an ordinary withdrawal still works.
begin;
select plan(3);

insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000fe', 'record venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values ('20000000-0000-4000-c000-0000000000fe', '10000000-0000-4000-b000-0000000000fe',
        '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
        'record test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
        current_date - 7, '23:59', 'UTC', 'first_come', '30 days', 5, 'approved');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000095', 'record1@t.local'),
  ('00000000-0000-4000-a000-000000000096', 'record2@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000095', 'record_one', 'Record One', 'The Played',
   'Seattle', 'WA', true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000096', 'record_two', 'Record Two', 'The Leaving',
   'Seattle', 'WA', true, '1.0', 'approved');

create temp table record_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000fe'
    and starts_at > now() order by starts_at limit 1;
grant select on record_night to public;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000095","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000095' from record_night;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000096","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000096' from record_night;

-- The host marks the first performer as performed.
reset role;
update signups set status = 'performed'
  where occurrence_id = (select id from record_night)
    and performer_id = '00000000-0000-4000-a000-000000000095';

-- The performed row survives its subject's delete; RLS filters, so the
-- assertion is on what remains.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000095","role":"authenticated"}', true);
delete from signups
  where occurrence_id = (select id from record_night)
    and performer_id = '00000000-0000-4000-a000-000000000095';
reset role;
select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from record_night)
     and performer_id = '00000000-0000-4000-a000-000000000095'),
  1,
  'a performed row cannot be erased by its subject'
);

-- An ordinary reservation still withdraws.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000096","role":"authenticated"}', true);
delete from signups
  where occurrence_id = (select id from record_night)
    and performer_id = '00000000-0000-4000-a000-000000000096';
reset role;
select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from record_night)
     and performer_id = '00000000-0000-4000-a000-000000000096'),
  0,
  'while a confirmed reservation still withdraws'
);

-- And nobody deletes someone else's row, guard or no guard.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000096","role":"authenticated"}', true);
delete from signups where occurrence_id = (select id from record_night);
reset role;
select is(
  (select count(*)::int from signups
   where occurrence_id = (select id from record_night)),
  1,
  'and never someone else''s row'
);

select * from finish();
rollback;
