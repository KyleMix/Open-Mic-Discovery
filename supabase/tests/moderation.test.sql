-- Content filter, admin moderation, and account deletion tests.
begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- Automated first-pass filter: clean content goes live, banned content holds.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

insert into venues (id, name, address_line, city, region, location, created_by)
values ('10000000-0000-4000-b000-0000000000e5', 'A Perfectly Nice Room', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', auth.uid());
select is(
  (select moderation_status from venues where id = '10000000-0000-4000-b000-0000000000e5'),
  'approved'::moderation_status,
  'clean venue text passes the filter and goes live'
);

insert into venues (id, name, address_line, city, region, location, created_by)
values ('10000000-0000-4000-b000-0000000000e6', 'the kys lounge', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', auth.uid());
select is(
  (select moderation_status from venues where id = '10000000-0000-4000-b000-0000000000e6'),
  'pending'::moderation_status,
  'banned terms hold content for review'
);

-- Profile free-text edits: clean edits stay live, dirty edits are held.
update profiles set bio = 'I sing sea shanties.' where id = auth.uid();
select is(
  (select moderation_status from profiles where id = auth.uid()),
  'approved'::moderation_status,
  'clean profile edits stay live'
);
update profiles set bio = 'kill yourself' where id = auth.uid();
select is(
  (select moderation_status from profiles where id = auth.uid()),
  'pending'::moderation_status,
  'abusive profile edits are held for review'
);

-- ---------------------------------------------------------------------------
-- Admin moderation
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select moderate_content('venue', '10000000-0000-4000-b000-0000000000e6', true)$$,
  '42501', 'only admins can moderate content',
  'non-admins cannot moderate'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$select moderate_content('venue', '10000000-0000-4000-b000-0000000000e6', false)$$,
  'an admin can reject held content'
);
select is(
  (select moderation_status from venues where id = '10000000-0000-4000-b000-0000000000e6'),
  'rejected'::moderation_status,
  'rejection sticks'
);

-- Admin resolves an abuse report through the standard update policy.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into reports (reporter_id, target_type, target_id, reason, details)
values (auth.uid(), 'profile', '00000000-0000-4000-a000-000000000003', 'harassment', 'test report');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
update reports set status = 'actioned', resolved_by = auth.uid(), resolved_at = now()
where target_id = '00000000-0000-4000-a000-000000000003' and status = 'open';
select is(
  (select count(*)::int from reports
   where target_id = '00000000-0000-4000-a000-000000000003' and status = 'actioned'),
  1,
  'admins can action reports'
);

-- ---------------------------------------------------------------------------
-- Account deletion: performer p1 deletes their account.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select lives_ok($$select delete_account()$$, 'a user can delete their own account');

reset role;
select is(
  (select count(*)::int from auth.users where id = '00000000-0000-4000-a000-000000000001'),
  0,
  'the auth user is gone: no further sign-ins'
);
select is(
  (select display_name from profiles where id = '00000000-0000-4000-a000-000000000001'),
  'Deleted user',
  'the profile is anonymized, preserving signup history integrity'
);

select * from finish();
rollback;
