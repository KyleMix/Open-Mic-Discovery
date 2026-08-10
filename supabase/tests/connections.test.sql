-- Network connections.
--
-- The assertions that carry weight are the negative ones. connection_nights
-- says where a named person will be on a given night, and it is SECURITY
-- DEFINER, so its mates CTE is the only thing standing between a caller and
-- everyone's plans: the tests assert a stranger gets zero rows, that the
-- sharing toggle empties the feed without dropping the connection, and that
-- a block severs the pair in the data, not just the view.
begin;
select plan(22);

-- Fixture: a nightly mic owned by p2 (demo_producer), so plans exist to see.
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000e1', 'network venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000e1', '10000000-0000-4000-b000-0000000000e1',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'network test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
   '23:59', 'UTC', 'first_come', '30 days', 20, 'approved');

create temp table night as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000e1'
    and starts_at > now() order by starts_at limit 1;
grant select on night to public;

-- Two more accounts: one who will connect, one who never does.
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000031', 'mate@t.local'),
  ('00000000-0000-4000-a000-000000000032', 'stranger@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, link_instagram, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000031', 'mate', 'Marta Mate', 'DJ Mate',
   'Seattle', 'WA', true, 'djmate', '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000032', 'stranger', 'Sam Stranger', 'The Stranger',
   'Seattle', 'WA', true, null, '1.0', 'approved');

-- ---------------------------------------------------------------------------
-- Asking.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

insert into connections (requester_id, addressee_id)
values (auth.uid(), '00000000-0000-4000-a000-000000000031');
select is(
  (select count(*)::int from connections
   where addressee_id = '00000000-0000-4000-a000-000000000031'),
  1,
  'a performer can ask another performer to connect'
);

select throws_ok(
  $$insert into connections (requester_id, addressee_id) values (auth.uid(), auth.uid())$$,
  '23514',
  null,
  'but cannot connect with themselves'
);

-- ---------------------------------------------------------------------------
-- The addressee's side.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);

select throws_ok(
  $$insert into connections (requester_id, addressee_id)
    values (auth.uid(), '00000000-0000-4000-a000-000000000001')$$,
  '23505',
  null,
  'asking back while a request is open cannot make a second pair'
);

select is(
  (select count(*)::int from my_connections),
  1,
  'the addressee sees the request waiting on them'
);
select is(
  (select i_requested from my_connections limit 1),
  false,
  'marked as one they did not send'
);

-- ---------------------------------------------------------------------------
-- A third account sees and touches nothing.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000032","role":"authenticated"}', true);

select is((select count(*)::int from connections), 0,
  'a stranger sees no connection rows at all');
select is((select count(*)::int from my_connections), 0,
  'and an empty network');
-- The broadest accept a stranger can aim: row level security filters the
-- pending row out of the update entirely, so nothing changes.
update connections set status = 'accepted';
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);
select is(
  (select status from connections where addressee_id = auth.uid()),
  'pending'::connection_status,
  'and cannot accept a request that is not theirs'
);

-- ---------------------------------------------------------------------------
-- Accepting.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);

update connections set status = 'accepted'
where requester_id = '00000000-0000-4000-a000-000000000001'
  and addressee_id = auth.uid();

select is(
  (select status from connections
   where addressee_id = auth.uid()),
  'accepted'::connection_status,
  'the addressee accepts with one update'
);
select isnt(
  (select responded_at from connections where addressee_id = auth.uid()),
  null,
  'and the server stamps when'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(
  (select other_id from my_connections where status = 'accepted'),
  '00000000-0000-4000-a000-000000000031'::uuid,
  'the requester sees who accepted'
);
select is(
  (select link_instagram from my_connections where status = 'accepted'),
  'djmate',
  'and the socials a connection is for'
);

-- Both ends of the exchange were told, through the outbox.
reset role;
select is(
  (select count(*)::int from notification_outbox
   where kind = 'connection_request'
     and profile_id = '00000000-0000-4000-a000-000000000031'),
  1,
  'the ask queued a push to the addressee'
);
select is(
  (select count(*)::int from notification_outbox
   where kind = 'connection_accepted'
     and profile_id = '00000000-0000-4000-a000-000000000001'),
  1,
  'and the accept queued one back to the requester'
);

-- ---------------------------------------------------------------------------
-- What a connection actually shows: upcoming attendance.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);
insert into attendance_plans (occurrence_id, profile_id) select id, auth.uid() from night;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::int from connection_nights),
  1,
  'a connection''s upcoming night is visible'
);
select is(
  (select title from connection_nights limit 1),
  'network test mic',
  'with enough of the listing to render a card'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000032","role":"authenticated"}', true);
select is(
  (select count(*)::int from connection_nights),
  0,
  'a stranger asking the definer view gets nothing at all'
);

-- The toggle hides every night without dropping the connection.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);
update profiles set share_attendance = false where id = auth.uid();

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::int from connection_nights),
  0,
  'sharing off means connections see no nights, connection intact'
);

-- ---------------------------------------------------------------------------
-- Blocking severs; declining is a delete.
-- ---------------------------------------------------------------------------
insert into blocks (blocker_id, blocked_id)
values (auth.uid(), '00000000-0000-4000-a000-000000000031');

reset role;
select is(
  (select count(*)::int from connections
   where requester_id = '00000000-0000-4000-a000-000000000001'
      or addressee_id = '00000000-0000-4000-a000-000000000001'),
  0,
  'blocking someone deletes the connection between you, not just hides it'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$insert into connections (requester_id, addressee_id)
    values (auth.uid(), '00000000-0000-4000-a000-000000000031')$$,
  '42501',
  null,
  'and no new request can cross a block in either direction'
);

delete from blocks where blocked_id = '00000000-0000-4000-a000-000000000031';
select lives_ok(
  $$insert into connections (requester_id, addressee_id)
    values (auth.uid(), '00000000-0000-4000-a000-000000000031')$$,
  'unblocking lets a fresh request through'
);

-- The addressee declines by deleting the row. No tombstone, no state.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000031","role":"authenticated"}', true);
delete from connections where addressee_id = auth.uid();

reset role;
select is(
  (select count(*)::int from connections
   where addressee_id = '00000000-0000-4000-a000-000000000031'),
  0,
  'a declined request leaves nothing behind'
);

select * from finish();
rollback;
