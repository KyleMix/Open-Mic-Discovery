-- A walk-in on the list must never break the reorder.
--
-- Walk-in rows have no performer_id. The slot-move notification trigger used
-- to insert that null into notification_outbox.profile_id, which aborted the
-- whole set_slot_order call: one walk-in froze the night's running order for
-- good. These pin the guard.
begin;
select plan(4);

insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000f7', 'walkin venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');

insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values ('20000000-0000-4000-c000-0000000000f7', '10000000-0000-4000-b000-0000000000f7',
        '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
        'walkin test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
        current_date - 7, '23:59', 'UTC', 'first_come', '30 days', 5, 'approved');

create temp table wi_night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f7'
    and starts_at > now() order by starts_at limit 1;
grant select on wi_night to public;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000051', 'walkin1@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000051', 'walkin_one', 'Walkin One', 'The Listed',
   'Seattle', 'WA', true, '1.0', 'approved');

-- One account holder signs up, then the host adds a walk-in.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000051","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
  select id, '00000000-0000-4000-a000-000000000051' from wi_night;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
insert into signups (occurrence_id, guest_name)
  select id, 'Door Name' from wi_night;

-- The host reorders so the walk-in moves to slot 1: both rows change number.
select lives_ok(
  $$select set_slot_order(
      (select id from wi_night),
      array[
        (select id from signups
         where occurrence_id = (select id from wi_night) and guest_name = 'Door Name'),
        (select id from signups
         where occurrence_id = (select id from wi_night)
           and performer_id = '00000000-0000-4000-a000-000000000051')
      ])$$,
  'reordering a list that contains a walk-in succeeds'
);

reset role;
select is(
  (select (slot_position)::text from signups
   where occurrence_id = (select id from wi_night) and guest_name = 'Door Name'),
  '1',
  'the walk-in took the new number'
);

-- The account holder moved from 1 to 2 and hears about it; the walk-in
-- queues nothing because there is nobody to tell.
select is(
  (select count(*)::int from notification_outbox
   where profile_id = '00000000-0000-4000-a000-000000000051'
     and body like 'The running order changed%'),
  1,
  'the moved account holder is queued a running-order notice'
);
select is(
  (select count(*)::int from notification_outbox where profile_id is null),
  0,
  'and no outbox row was attempted for the walk-in'
);

select * from finish();
rollback;
