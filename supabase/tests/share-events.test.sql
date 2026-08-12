-- Share telemetry is append-only and unattributable to anyone but yourself.
-- The assertions that matter are the negative ones: nobody can write an
-- event under someone else's id, nobody but an admin can read any of it
-- back, and the rows cannot be edited after the fact.
begin;
select plan(17);

-- Fixture: an approved mic to share.
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000e1', 'share venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, moderation_status)
values ('20000000-0000-4000-c000-0000000000e1', '10000000-0000-4000-b000-0000000000e1',
        '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
        'share test mic', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO', current_date, '20:00',
        'America/Los_Angeles', 'first_come', 'approved');

-- ---------------------------------------------------------------------------
-- A signed-in performer records their own events.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

insert into share_events (profile_id, series_id, intent, action)
values ('00000000-0000-4000-a000-000000000001',
        '20000000-0000-4000-c000-0000000000e1', 'performer', 'sheet_open');
insert into share_events (profile_id, series_id, intent, action, channel)
values ('00000000-0000-4000-a000-000000000001',
        '20000000-0000-4000-c000-0000000000e1', 'performer', 'share_completed',
        'com.apple.UIKit.activity.Message');
select pass('a signed-in sharer can record events under their own id');

select throws_ok(
  $$insert into share_events (profile_id, series_id, intent, action)
    values ('00000000-0000-4000-a000-000000000002',
            '20000000-0000-4000-c000-0000000000e1', 'performer', 'sheet_open')$$,
  '42501',
  null,
  'but never under someone else''s id'
);

select throws_ok(
  $$insert into share_events (profile_id, series_id, intent, action)
    values (auth.uid(), '20000000-0000-4000-c000-0000000000e1', 'performer', 'liked')$$,
  '23514',
  null,
  'and only the actions the sheet actually fires'
);

-- Write-only: the sharer cannot read their own rows back, because nothing in
-- the app needs to and a readable behavior log is a liability.
select is(
  (select count(*)::int from share_events),
  0,
  'a sharer reads nothing back, not even their own events'
);

-- Append-only: the migration revokes update and delete outright, so the
-- attempts are refused at the privilege layer, before RLS is even consulted.
select throws_ok(
  $$update share_events set intent = 'producer'
    where profile_id = '00000000-0000-4000-a000-000000000001'$$,
  '42501',
  null,
  'an update is refused outright'
);
select throws_ok(
  $$delete from share_events where profile_id = '00000000-0000-4000-a000-000000000001'$$,
  '42501',
  null,
  'and so is a delete'
);

-- ---------------------------------------------------------------------------
-- App invites: the one event with no mic attached (20260811000500).
-- ---------------------------------------------------------------------------
insert into share_events (profile_id, series_id, intent, action, channel)
values ('00000000-0000-4000-a000-000000000001', null, 'invite', 'app_invite',
        'com.apple.UIKit.activity.Message');
select pass('a signed-in person can record an app invite with no series');

select throws_ok(
  $$insert into share_events (profile_id, series_id, intent, action)
    values ('00000000-0000-4000-a000-000000000001', null, 'neutral', 'sheet_open')$$,
  '23514',
  null,
  'but no other action may drop the series'
);

select throws_ok(
  $$insert into share_events (profile_id, series_id, intent, action)
    values ('00000000-0000-4000-a000-000000000001',
            '20000000-0000-4000-c000-0000000000e1', 'invite', 'app_invite')$$,
  '23514',
  null,
  'and an invite may not smuggle a series in'
);

select throws_ok(
  $$insert into share_events (profile_id, series_id, intent, action)
    values ('00000000-0000-4000-a000-000000000001', null, 'performer', 'app_invite')$$,
  '23514',
  null,
  'and an invite carries only the invite intent'
);

-- The host's signup poster is a normal mic share under a new action.
insert into share_events (profile_id, series_id, intent, action)
values ('00000000-0000-4000-a000-000000000001',
        '20000000-0000-4000-c000-0000000000e1', 'producer', 'poster_share');
select pass('a signup poster share records like any other mic share');

-- ---------------------------------------------------------------------------
-- A guest shares without an account.
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into share_events (series_id, intent, action)
values ('20000000-0000-4000-c000-0000000000e1', 'neutral', 'sheet_open');
select pass('a guest can record an event with no profile id');

select throws_ok(
  $$insert into share_events (profile_id, series_id, intent, action)
    values ('00000000-0000-4000-a000-000000000001',
            '20000000-0000-4000-c000-0000000000e1', 'neutral', 'sheet_open')$$,
  '42501',
  null,
  'but cannot pin an event on a signed-in person'
);

select is(
  (select count(*)::int from share_events),
  0,
  'and reads nothing back either'
);

-- ---------------------------------------------------------------------------
-- What actually landed, seen from outside the API roles.
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int from share_events),
  5,
  'all five inserts landed and the update and delete attempts changed nothing'
);
select is(
  (select count(*)::int from share_events where intent = 'producer' and action <> 'poster_share'),
  0,
  'the refused update wrote no rows'
);
select is(
  (select channel from share_events where action = 'share_completed'),
  'com.apple.UIKit.activity.Message',
  'the destination channel rides along when the OS reports one'
);

select * from finish();
rollback;
