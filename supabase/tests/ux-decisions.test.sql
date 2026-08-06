-- Tests for the decision batch: cancellation notifications, walk-in guests,
-- spot counts, the blocked-profiles view, the trust loop, and ranking.
begin;
select plan(22);

-- Fixture: a first-come night with capacity 3 owned by p2, plus performers.
insert into venues (id, name, address_line, city, region, location, moderation_status)
values ('10000000-0000-4000-b000-0000000000f1', 'decisions venue', 'x', 'Seattle', 'WA',
        'POINT(-122.3 47.6)', 'approved');
insert into mic_series (id, venue_id, created_by, owner_id, title, disciplines, rrule,
                        anchor_date, start_time, timezone, signup_method, signup_opens,
                        capacity, moderation_status)
values
  ('20000000-0000-4000-c000-0000000000f1', '10000000-0000-4000-b000-0000000000f1',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002',
   'decisions fc', '{comedy}', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU', current_date - 7,
   '23:59', 'UTC', 'first_come', '30 days', 3, 'approved');
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000021', 'ux1@t.local');
insert into profiles (id, handle, display_name, stage_name, home_city, home_region,
                      is_performer, eula_version, moderation_status) values
  ('00000000-0000-4000-a000-000000000021', 'ux_perf', 'UX Perf', 'UX Perf', 'Seattle', 'WA',
   true, '1.0', 'approved');

create temp table ux_occ as
  select id from mic_occurrences
  where series_id = '20000000-0000-4000-c000-0000000000f1'
    and starts_at > now() order by starts_at limit 1;
grant select on ux_occ to public;

-- ---------------------------------------------------------------------------
-- Walk-in guests
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

insert into signups (occurrence_id, guest_name)
select id, 'Walk-in Wanda' from ux_occ;
select is(
  (select status from signups where guest_name = 'Walk-in Wanda'),
  'confirmed'::signup_status,
  'a producer can add a walk-in guest, who flows through the lifecycle'
);
select is(
  (select guest_name from signup_roster
   where occurrence_id = (select id from ux_occ) and performer_id is null),
  'Walk-in Wanda',
  'guests appear on the roster by their given name'
);

-- A non-owner cannot add guests to someone else's night.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000021","role":"authenticated"}', true);
select throws_ok(
  $sql$ insert into signups (occurrence_id, guest_name)
        select id, 'Sneaky Guest' from ux_occ $sql$,
  '42501', null,
  'only the producer can add walk-ins'
);

-- Exactly one identity per row.
set local role postgres;
select throws_ok(
  $sql$ insert into signups (occurrence_id, performer_id, guest_name)
        select id, '00000000-0000-4000-a000-000000000021', 'Both Ways' from ux_occ $sql$,
  '23514', null,
  'a signup is a performer or a guest, never both'
);

-- Guest status changes enqueue no notification (no account behind them).
update signups set status = 'no_show' where guest_name = 'Walk-in Wanda';
select is(
  (select count(*)::int from notification_outbox where kind = 'signup_status'),
  0,
  'guest rows never enqueue notifications'
);

-- ---------------------------------------------------------------------------
-- Spot counts
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000021","role":"authenticated"}', true);
insert into signups (occurrence_id, performer_id)
select id, auth.uid() from ux_occ;
select results_eq(
  'select taken, capacity from signup_counts((select id from ux_occ))',
  $sql$ values (1, 3::smallint) $sql$,
  'signup_counts reports taken versus capacity without names'
);

-- ---------------------------------------------------------------------------
-- Cancellation notifications
-- ---------------------------------------------------------------------------
set local role postgres;
delete from notification_outbox;
update mic_occurrences
set status = 'cancelled', cancellation_note = 'Pipes burst'
where id = (select id from ux_occ);
select is(
  (select count(*)::int from notification_outbox
   where kind = 'occurrence_cancelled'
     and profile_id = '00000000-0000-4000-a000-000000000021'),
  1,
  'cancelling a night notifies the performers on its list'
);
select ok(
  (select body like '%is cancelled.%Pipes burst%' from notification_outbox
   where kind = 'occurrence_cancelled' limit 1),
  'the cancellation note rides along in the push body'
);
select is(
  (select count(*)::int from notification_outbox where kind = 'occurrence_cancelled'),
  1,
  'guests and non-listed users are not notified'
);
-- Restoring and re-cancelling does not double up silently by trigger design
-- (each real transition notifies; that is intended).

-- ---------------------------------------------------------------------------
-- Blocked profiles view
-- ---------------------------------------------------------------------------
set local role postgres;
insert into blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-a000-000000000021', '00000000-0000-4000-a000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000021","role":"authenticated"}', true);
select is(
  (select count(*)::int from blocked_profiles),
  1,
  'a blocker sees their own block list'
);
select isnt(
  (select handle from blocked_profiles limit 1),
  null,
  'and the blocked handle is visible for the unblock list'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::int from blocked_profiles),
  0,
  'nobody else can read that list, including the blocked person'
);
set local role postgres;
delete from blocks where blocker_id = '00000000-0000-4000-a000-000000000021';

-- ---------------------------------------------------------------------------
-- Trust loop: flag dedupe, resolve_flag pausing, nudges, auto-pause
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000021","role":"authenticated"}', true);
insert into listing_flags (series_id, flagger_id, reason)
values ('20000000-0000-4000-c000-0000000000f1', auth.uid(), 'permanently_dead');
select throws_ok(
  $sql$ insert into listing_flags (series_id, flagger_id, reason)
        values ('20000000-0000-4000-c000-0000000000f1',
                '00000000-0000-4000-a000-000000000021', 'permanently_dead') $sql$,
  '23505', null,
  'the same person cannot stack open flags for the same reason'
);
select throws_ok(
  $sql$ select resolve_flag((select id from listing_flags
         where series_id = '20000000-0000-4000-c000-0000000000f1' limit 1), true) $sql$,
  '42501', null,
  'non-admins cannot resolve flags'
);

-- Admin confirms the dead flag: listing pauses and the owner hears about it.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $sql$ select resolve_flag((select id from listing_flags
         where series_id = '20000000-0000-4000-c000-0000000000f1' limit 1), true) $sql$,
  'an admin can resolve a flag'
);
set local role postgres;
-- Clear impersonation: the confirm guard re-stamps last_confirmed_at for any
-- authenticated caller, and the backdating below must stick.
select set_config('request.jwt.claims', '', true);
select is(
  (select is_active from mic_series where id = '20000000-0000-4000-c000-0000000000f1'),
  false,
  'a confirmed dead flag pauses the listing'
);
select is(
  (select count(*)::int from notification_outbox
   where kind = 'listing_auto_paused'
     and profile_id = '00000000-0000-4000-a000-000000000002'),
  1,
  'and the owner is told, with a path to resume'
);

-- Nudges: an owned, active listing unconfirmed for 65 days gets stage 2,
-- and re-running does not duplicate it.
update mic_series
set is_active = true, last_confirmed_at = now() - interval '65 days'
where id = '20000000-0000-4000-c000-0000000000f1';
delete from notification_outbox;
select ok(
  private.queue_confirm_nudges() >= 1,
  'stale listings queue a confirm nudge to their owner'
);
select is(private.queue_confirm_nudges(), 0, 'nudges do not repeat for the same stage');

-- Auto-pause needs 90 days plus two recorded nudges.
update mic_series
set last_confirmed_at = now() - interval '95 days'
where id = '20000000-0000-4000-c000-0000000000f1';
insert into notification_outbox (profile_id, kind, title, body, payload)
values
  ('00000000-0000-4000-a000-000000000002', 'confirm_nudge', 't', 'b',
   jsonb_build_object('series_id', '20000000-0000-4000-c000-0000000000f1', 'stage', 1)),
  ('00000000-0000-4000-a000-000000000002', 'confirm_nudge', 't', 'b',
   jsonb_build_object('series_id', '20000000-0000-4000-c000-0000000000f1', 'stage', 2));
select ok(private.auto_pause_stale_series() >= 1, 'ignored nudges auto-pause the listing');
select is(
  (select is_active from mic_series where id = '20000000-0000-4000-c000-0000000000f1'),
  false,
  'the auto-paused listing is inactive'
);

-- ---------------------------------------------------------------------------
-- Ranking: paused listings leave mics_near
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from mics_near(47.6, -122.3, 50000)
   where series_id = '20000000-0000-4000-c000-0000000000f1'),
  0,
  'paused listings are gone from discovery server-side'
);

select * from finish();
rollback;
