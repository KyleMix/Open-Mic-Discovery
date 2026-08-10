-- am_admin_reader tells the app who may see the moderation queue.
begin;
select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000091', 'reader@t.local'),
  ('00000000-0000-4000-a000-000000000092', 'civilian@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000091', 'ro_reader', 'Ro Reader', 'The Reader', 'Seattle',
   'WA', true, '1.0', 'approved'),
  ('00000000-0000-4000-a000-000000000092', 'civilian', 'Civ Ilian', 'The Public', 'Seattle',
   'WA', true, '1.0', 'approved');
insert into admin.admin_users (user_id, role, active, created_by)
values ('00000000-0000-4000-a000-000000000091', 'read_only', true,
        '00000000-0000-4000-a000-000000000091');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000091","role":"authenticated"}', true);
select is((select am_admin_reader()), true, 'an active read_only reviewer reads the queue');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000092","role":"authenticated"}', true);
select is((select am_admin_reader()), false, 'an ordinary account does not');

reset role;
update admin.admin_users set active = false
  where user_id = '00000000-0000-4000-a000-000000000091';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000091","role":"authenticated"}', true);
select is((select am_admin_reader()), false, 'a revoked reviewer loses the queue');
reset role;

select * from finish();
rollback;
