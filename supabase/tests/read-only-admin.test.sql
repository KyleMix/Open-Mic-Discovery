-- A read_only admin sees the queue and writes nothing.
--
-- The fixture: 0001 is a plain performer, made a read_only admin here by
-- inserting the allowlist row directly (the table owner can, the RPCs are the
-- only path for anyone else). 0004 stays a moderator and 0005 the owner, so the
-- three roles can be compared against the same rows.
--
-- On shape, again: an INSERT that fails WITH CHECK raises 42501, while an UPDATE
-- that fails USING silently affects zero rows. Both appear below.
begin;
select plan(37);

insert into admin.admin_users (user_id, role, active, created_by)
values ('00000000-0000-4000-a000-000000000001', 'read_only', true,
        '00000000-0000-4000-a000-000000000005');

-- The cache is the write predicate, and a read_only admin is not in it.
select is(
  (select is_admin from profiles where id = '00000000-0000-4000-a000-000000000001'),
  false,
  'a read_only admin does not carry profiles.is_admin'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select ok(
  (select private.is_admin_reader()),
  'but the reader predicate is true for them'
);
select ok(
  not (select private.is_admin()),
  'while the write predicate is not'
);

-- ---------------------------------------------------------------------------
-- Something to look at. Held content and a queue item, created before the
-- read_only session starts reading.
-- ---------------------------------------------------------------------------
reset role;
-- The claims have to go too, not just the role. reset role leaves
-- request.jwt.claims set, and guard_moderated_writes keys off auth.uid(): with a
-- session still visible it treats these as end-user writes and runs the content
-- filter, which would approve the venue below on the way in and make the "cannot
-- approve held content" assertion pass for the wrong reason.
select set_config('request.jwt.claims', '', true);

insert into venues (id, name, address_line, city, region, location, created_by,
                    moderation_status)
values ('10000000-0000-4000-b000-0000000000d1', 'The Held Room', 'x', 'Seattle',
        'WA', 'POINT(-122.3 47.6)', '00000000-0000-4000-a000-000000000002',
        'pending');
insert into reports (id, reporter_id, target_type, target_id, reason, details)
values ('30000000-0000-4000-d000-0000000000d1',
        '00000000-0000-4000-a000-000000000003', 'venue',
        '10000000-0000-4000-b000-0000000000d1', 'spam', 'a queue item to read');
insert into report_triage (report_id, assigned_to, resolution)
values ('30000000-0000-4000-d000-0000000000d1',
        '00000000-0000-4000-a000-000000000004', 'Looking into it.');
insert into user_sanctions (id, user_id, type, scope, reason, created_by)
values ('40000000-0000-4000-e000-0000000000d1',
        '00000000-0000-4000-a000-000000000003', 'warned', 'all_writes',
        'A warning to read.', '00000000-0000-4000-a000-000000000004');

-- ---------------------------------------------------------------------------
-- What a read_only admin can read.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::int from reports
    where id = '30000000-0000-4000-d000-0000000000d1'),
  1,
  'the report queue is readable'
);
select is(
  (select count(*)::int from report_triage
    where report_id = '30000000-0000-4000-d000-0000000000d1'),
  1,
  'including the triage attached to an item'
);
select is(
  (select count(*)::int from venues
    where id = '10000000-0000-4000-b000-0000000000d1'),
  1,
  'held content is readable, which is the point of the role'
);
select cmp_ok(
  (select count(*)::int from mic_series), '>', 0,
  'listings are readable, held ones included'
);
select cmp_ok(
  (select count(*)::int from admin_profile_review), '>', 1,
  'other accounts are readable through admin_profile_review, so a held profile can be reviewed'
);
select is(
  (select count(*)::int from user_sanctions
    where id = '40000000-0000-4000-e000-0000000000d1'),
  1,
  'somebody else sanctions are readable'
);
select cmp_ok(
  (select count(*)::int from listing_flags), '>=', 0,
  'listing flags are readable'
);
select cmp_ok(
  (select count(*)::int from claim_requests), '>=', 0,
  'and claim requests'
);
select cmp_ok(
  (select count(*)::int from signups), '>', 0,
  'rosters are readable, so a report about a night has context'
);
select cmp_ok(
  (select count(*)::int from mic_occurrences), '>', 0,
  'and the nights themselves'
);

-- ---------------------------------------------------------------------------
-- What a read_only admin still cannot read, deliberately.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from producer_profiles), 0,
  'the producer base table is unreadable, so raw contact details are not on offer'
);
select cmp_ok(
  (select count(*)::int from admin_producer_review), '>', 0,
  'the masked producer view is readable, because a shape is not a contact detail'
);
select ok(
  (select bool_and(contact_email_masked is null or contact_email_masked like '%***%')
     from admin_producer_review),
  'and every address in it is a mask rather than a value'
);
select is(
  (select count(*)::int from banned_terms), 0,
  'the banned term list stays hidden, because it is a setting and not the queue'
);
select is(
  (select count(*)::int from test_kit_settings), 0,
  'and the test kit stays hidden, because it mints sign-ins'
);
select is(
  (select count(*)::int from test_kit_objects), 0,
  'both halves of it'
);

-- ---------------------------------------------------------------------------
-- What a read_only admin cannot write. Anything.
-- ---------------------------------------------------------------------------
update reports set status = 'actioned'
where id = '30000000-0000-4000-d000-0000000000d1';
select is(
  (select status from reports where id = '30000000-0000-4000-d000-0000000000d1'),
  'open'::report_status,
  'they cannot resolve a report'
);

update venues set moderation_status = 'approved'
where id = '10000000-0000-4000-b000-0000000000d1';
select is(
  (select moderation_status from venues
    where id = '10000000-0000-4000-b000-0000000000d1'),
  'pending'::moderation_status,
  'or approve held content by hand'
);

update mic_series set title = 'read_only renamed this'
where owner_id = '00000000-0000-4000-a000-000000000002';
select is(
  (select count(*)::int from mic_series where title = 'read_only renamed this'),
  0,
  'or edit a listing'
);

-- Read back through the review view, because since 20260807001600 the base
-- table is not readable by an admin at all and a null would have compared equal
-- to a null and passed for the wrong reason.
update profiles set moderation_status = 'rejected'
where id = '00000000-0000-4000-a000-000000000003';
select is(
  (select moderation_status from admin_profile_review
    where id = '00000000-0000-4000-a000-000000000003'),
  'approved'::moderation_status,
  'or reject a profile'
);

-- user_sanctions refuses outright rather than filtering, because there the
-- UPDATE grant was revoked as well as the policy being absent. Belt and braces,
-- and the error is the belt showing.
select throws_ok(
  $$update user_sanctions set lifted_at = now()
     where id = '40000000-0000-4000-e000-0000000000d1'$$,
  '42501', null,
  'or lift a sanction by writing the row'
);

-- report_triage keeps its UPDATE grant, because a moderator is `authenticated`
-- too and needs it. Only DELETE and TRUNCATE were revoked there (20260807001100),
-- so this one filters rather than raises.
update report_triage set resolution = 'read_only wrote this'
where report_id = '30000000-0000-4000-d000-0000000000d1';
select is(
  (select resolution from report_triage
    where report_id = '30000000-0000-4000-d000-0000000000d1'),
  'Looking into it.',
  'or write a triage note'
);

-- Every privileged RPC checks the write predicate, so all of them refuse.
select throws_ok(
  $$select moderate_content('venue', '10000000-0000-4000-b000-0000000000d1', true)$$,
  '42501', 'only admins can moderate content',
  'moderate_content refuses a read_only admin'
);
select throws_ok(
  $$select resolve_flag('00000000-0000-4000-a000-000000000001', true)$$,
  '42501', 'only moderators can resolve flags',
  'resolve_flag refuses them'
);
select throws_ok(
  $$select review_claim('00000000-0000-4000-a000-000000000001', true)$$,
  '42501', 'only admins can review claims',
  'review_claim refuses them'
);
select throws_ok(
  $$select admin_sanction_apply('00000000-0000-4000-a000-000000000003',
      'banned', 'all_writes', null, 'read_only trying to ban', '203.0.113.7'::inet)$$,
  '42501', 'only a moderator or an owner can sanction an account',
  'and they cannot sanction anyone'
);
select throws_ok(
  $$select admin_invite('someone@example.com', 'owner', 'escalating',
      '203.0.113.7'::inet)$$,
  '42501', 'only an owner can manage admins',
  'or invite themselves an owner account'
);
select throws_ok(
  $$select test_kit_set_enabled(true)$$,
  '42501', 'the test kit is admin only',
  'or switch the test kit back on'
);
select throws_ok(
  $$select admin_reveal('00000000-0000-4000-a000-000000000002', 'contact_phone',
      'read_only wants a phone number', '203.0.113.7'::inet)$$,
  '42501', 'only a moderator or an owner can reveal contact details',
  'and cannot unmask a contact detail: oversight does not need somebody phone number'
);

-- ---------------------------------------------------------------------------
-- The moderator is unchanged by all of this, which is the regression that would
-- matter most.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select ok(
  (select private.is_admin()) and (select private.is_admin_reader()),
  'a moderator satisfies both predicates'
);
select lives_ok(
  $$select moderate_content('venue', '10000000-0000-4000-b000-0000000000d1', true)$$,
  'and can still moderate held content'
);
select is(
  (select count(*)::int from producer_profiles), 0,
  'and reads the producer base table no more than read_only does, since 20260807001600'
);
reset role;

-- ---------------------------------------------------------------------------
-- And a plain user with no allowlist row still sees nothing of any of it.
-- ---------------------------------------------------------------------------
delete from admin.admin_users where user_id = '00000000-0000-4000-a000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select ok(
  not (select private.is_admin_reader()),
  'removing the allowlist row takes the reader predicate away again'
);
select is(
  (select count(*)::int from reports
    where id = '30000000-0000-4000-d000-0000000000d1'),
  0,
  'and the queue goes back to being invisible'
);
reset role;

select * from finish();
rollback;
