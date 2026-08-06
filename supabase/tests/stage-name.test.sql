-- Stage name is the public identity; display_name is private.
--
-- The assertions that matter are the negative ones: display_name must not be
-- reachable through any view anon or authenticated can read, because the whole
-- point of the split is that a performer's off-stage name never lands on a
-- public roster.
begin;
select plan(10);

select has_column('public', 'profiles', 'stage_name', 'profiles has a stage_name');

select is(
  (select count(*)::int from profiles where stage_name is null),
  0,
  'every profile has a stage name after the backfill'
);

-- The public name is exposed.
select has_column('public', 'public_profiles', 'stage_name', 'public_profiles exposes stage_name');
select has_column('public', 'signup_roster', 'stage_name', 'signup_roster exposes stage_name');

-- The private name is not, anywhere.
select hasnt_column(
  'public', 'public_profiles', 'display_name',
  'public_profiles never exposes display_name'
);
select hasnt_column(
  'public', 'signup_roster', 'display_name',
  'signup_roster never exposes display_name'
);

-- Anonymous readers get the stage name, and specifically not the private one.
-- Compared against literals rather than the base table, which anon cannot read
-- at all: two nulls would have compared equal and passed for the wrong reason.
set local role anon;
select is(
  (select stage_name from public_profiles where handle = 'demo_performer'),
  'Demi Delta',
  'anonymous readers see the stage name'
);
select isnt(
  (select stage_name from public_profiles where handle = 'demo_performer'),
  'Demi Performer',
  'anonymous readers never see the private display name'
);
reset role;

-- Public free text goes through moderation. A stage name that trips the
-- filter must hold the profile rather than publish it, the same as bio.
select is(
  (select private.text_is_clean('a clean stage name', null, null)),
  true,
  'a clean stage name passes the content filter'
);

-- Deletion scrubs the public identity, not just the private one.
select is(
  (select count(*)::int
   from pg_get_functiondef('private.delete_account_for(uuid)'::regprocedure) def
   where def like '%stage_name = ''Deleted user''%'),
  1,
  'account deletion scrubs the stage name'
);

select * from finish();
rollback;
