-- Blocked-name snapshot: the Settings unblock list shows who is blocked.
begin;
select plan(6);

select has_column(
  'public', 'blocks', 'blocked_display_name',
  'blocks carries the display-name snapshot column'
);

-- ---------------------------------------------------------------------------
-- The trigger snapshots the name on insert, as an ordinary authenticated user
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

insert into blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002');

select is(
  (select blocked_display_name from blocks
   where blocker_id = '00000000-0000-4000-a000-000000000001'
     and blocked_id = '00000000-0000-4000-a000-000000000002'),
  'Pat Producer',
  'blocking snapshots the blocked user''s display name'
);

-- A client cannot spoof the snapshot; the trigger overwrites whatever it sends.
insert into blocks (blocker_id, blocked_id, blocked_display_name)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004', 'Fake Name');

select is(
  (select blocked_display_name from blocks
   where blocker_id = '00000000-0000-4000-a000-000000000001'
     and blocked_id = '00000000-0000-4000-a000-000000000004'),
  'Alex Admin',
  'the trigger overwrites a client-supplied name'
);

select is(
  (select count(*)::int from blocks
   where blocker_id = '00000000-0000-4000-a000-000000000001'),
  2,
  'the blocker reads their own block rows'
);

-- ---------------------------------------------------------------------------
-- The blocked user still cannot see the block row (or the snapshot)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::int from blocks
   where blocked_id = '00000000-0000-4000-a000-000000000002'),
  0,
  'the blocked user cannot read the block row'
);

-- ---------------------------------------------------------------------------
-- Backfill covered rows inserted before the trigger existed
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int from blocks where blocked_display_name is null),
  0,
  'no block row is left without a name snapshot'
);

select * from finish();
rollback;
