-- Contact details are masked by default, and unmasking one costs a reason and
-- leaves a record.
--
-- Seed: 0004 moderator, 0005 owner, 0002 a producer with contact_email
-- pat@demo.openmicexplorer.local and contact_phone +12065550142, 0003 a producer
-- with an email and no phone, 0001 a plain performer.
begin;
select plan(29);

-- ---------------------------------------------------------------------------
-- Masking, on its own. A mask has to be enough to recognise a record and not
-- enough to contact anybody.
-- ---------------------------------------------------------------------------
select is(private.mask_email('pat@demo.openmicexplorer.local'),
          'p***t@demo.openmicexplorer.local',
          'an address keeps its first and last character and its domain');
select is(private.mask_email('a@b.com'), 'a***@b.com',
          'a one character local part does not repeat itself');
select is(private.mask_email(null), null, 'null masks to null rather than to a shape');
select is(private.mask_email('not-an-address'), '***',
          'and something that is not an address reveals nothing at all');
select is(private.mask_phone('+12065550142'), '**** 0142',
          'a phone number keeps four digits');
select is(private.mask_phone('12'), '***',
          'a number too short to mask usefully is withheld entirely');
select is(private.mask_phone(null), null, 'and null stays null');

-- ---------------------------------------------------------------------------
-- The base tables are closed to admins now. Both of them.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);

select is(
  (select count(*)::int from producer_profiles), 0,
  'a moderator reads no row of producer_profiles'
);
select is(
  (select count(*)::int from profiles
    where id <> '00000000-0000-4000-a000-000000000004'), 0,
  'and no profile but their own'
);

-- What they read instead.
select cmp_ok(
  (select count(*)::int from admin_profile_review), '>=', 5,
  'admin_profile_review shows every account'
);
select is(
  (select contact_email_masked from admin_producer_review
    where profile_id = '00000000-0000-4000-a000-000000000002'),
  'p***t@demo.openmicexplorer.local',
  'and admin_producer_review shows a masked address'
);
select is(
  (select contact_phone_masked from admin_producer_review
    where profile_id = '00000000-0000-4000-a000-000000000002'),
  '**** 0142',
  'and a masked phone number'
);
select ok(
  (select has_payout_ref is not null from admin_producer_review
    where profile_id = '00000000-0000-4000-a000-000000000002'),
  'whether a payout reference exists is answerable'
);
select hasnt_column('public', 'admin_producer_review', 'payout_ref',
  'and what it says is not in the view at all');
select hasnt_column('public', 'admin_profile_review', 'display_name',
  'the profile view keeps the private name out, as every other view does');
select hasnt_column('public', 'admin_profile_review', 'birth_year',
  'and birth_year');
select hasnt_column('public', 'admin_profile_review', 'home_location',
  'and home_location');

-- ---------------------------------------------------------------------------
-- The reveal.
-- ---------------------------------------------------------------------------
select is(
  admin_reveal('00000000-0000-4000-a000-000000000002', 'contact_phone',
    'Venue called about a booking dispute and needs to reach the host.',
    '203.0.113.7'::inet),
  '+12065550142',
  'a moderator with a reason gets the real number'
);
select is(
  admin_reveal('00000000-0000-4000-a000-000000000002', 'email',
    'Following up the same dispute by email.', '203.0.113.7'::inet),
  'producer@demo.openmicexplorer.local',
  'and can reach the account address, which lives in auth.users and no view exposes'
);
select is(
  admin_reveal('00000000-0000-4000-a000-000000000001', 'display_name',
    'Impersonation report names the off-stage name.', '203.0.113.7'::inet),
  'Demi Performer',
  'the private name is reachable this way and only this way'
);

-- What a reveal cannot reach, by any role.
select throws_ok(
  $$select admin_reveal('00000000-0000-4000-a000-000000000002', 'payout_ref',
      'curious', '203.0.113.7'::inet)$$,
  '22P02', null,
  'payout_ref is not revealable, because no moderation decision needs it'
);
select throws_ok(
  $$select admin_reveal('00000000-0000-4000-a000-000000000001', 'home_location',
      'curious', '203.0.113.7'::inet)$$,
  '22P02', null,
  'and neither is a coordinate'
);

-- A reason is the price of admission.
select throws_ok(
  $$select admin_reveal('00000000-0000-4000-a000-000000000002', 'contact_phone',
      '  ', '203.0.113.7'::inet)$$,
  '23514', 'a reveal needs a reason somebody can read later',
  'a blank reason is refused'
);
reset role;

-- ---------------------------------------------------------------------------
-- The record. Which field, never the value.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from admin.audit_log where action = 'pii.reveal'),
  3,
  'every successful reveal wrote an audit entry, and the refused ones wrote none'
);
select ok(
  (select bool_and(after_state ->> 'field' is not null)
     from admin.audit_log where action = 'pii.reveal'),
  'each entry names the field that was revealed'
);
select is(
  (select count(*)::int from admin.audit_log
    where action = 'pii.reveal'
      and (after_state::text like '%12065550142%'
           or after_state::text like '%Demi Performer%'
           or before_state::text like '%12065550142%')),
  0,
  'and none of them records the value, because the log is readable by every admin'
);
select ok(
  (select bool_and(not reversible) from admin.audit_log where action = 'pii.reveal'),
  'a reveal is recorded as not reversible: what has been seen cannot be unseen'
);

-- ---------------------------------------------------------------------------
-- Who cannot reveal.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select admin_reveal('00000000-0000-4000-a000-000000000002', 'contact_phone',
      'I would like their number', '203.0.113.7'::inet)$$,
  '42501', 'only a moderator or an owner can reveal contact details',
  'a plain user cannot reveal anything'
);
select is(
  (select count(*)::int from admin_producer_review), 0,
  'and does not see the masked view either'
);
reset role;

select * from finish();
rollback;
