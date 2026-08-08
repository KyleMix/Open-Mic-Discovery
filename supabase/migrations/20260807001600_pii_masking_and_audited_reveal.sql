-- Contact details are masked, and revealing one costs a reason and an audit row.
--
-- Requirement S12, and the gap the Phase 0 report named: `producer profile admin
-- select` handed any admin contact_email, contact_phone and payout_ref with no
-- reason and no record, and `profiles admin select` handed over birth_year,
-- home_city, home_location and display_name the same way. 20260807001500 then
-- widened the second one to read_only admins, which is the thing this migration
-- owes a fix for.
--
-- The shape:
--
--   1. Two admin review views expose the columns moderation actually needs, with
--      contact details masked to a shape (`k***n@gmail.com`, `**** 0142`) rather
--      than a value. Everything else is simply absent.
--   2. The blanket admin select policies on profiles and producer_profiles are
--      dropped, so the views are the only path.
--   3. admin_reveal() returns one field, for one person, against a required
--      reason, and appends an audit row before returning it.
--
-- Row level security cannot hide columns, which is why this is views plus a
-- narrowed policy rather than a column-level grant. Same reason public_profiles
-- exists (ARCHITECTURE.md, 2026-07-28), and the views use the same
-- security_invoker = off with the predicate in the WHERE clause as their access
-- control.
--
-- ---------------------------------------------------------------------------
-- Two decisions, one of which corrects something I wrote earlier
-- ---------------------------------------------------------------------------
--
-- Revealing requires owner or moderator, NOT read_only. The header of
-- 20260807001300 says the opposite, that read_only is a valid actor on the audit
-- log because S12 wants a row when one of them reveals an email. That was
-- speculation about who reveals, and it is wrong on reflection: read_only exists
-- for oversight, and oversight does not need somebody's phone number. read_only
-- remains a valid actor in the log, because nothing else depends on it and an
-- actor the log cannot record is worse than one it can, but it cannot reveal.
--
-- payout_ref and home_location are not revealable at all, by any role. A payment
-- provider reference supports no moderation decision, and a coordinate is not
-- something a decision needs when home_city answers the same question. Absent
-- from the views and absent from the whitelist, so the only way to either is the
-- database itself.
--
-- Down migration:
-- supabase/migrations/down/20260807001600_pii_masking_and_audited_reveal.down.sql

-- ---------------------------------------------------------------------------
-- 1. Masking
--
-- The point of a mask is to let somebody confirm they are looking at the right
-- record without handing over the record. First character, last character, and
-- the domain is enough to match against a support email; four digits is enough
-- to match against a phone number a venue gave you.
-- ---------------------------------------------------------------------------
create or replace function private.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or btrim(p_email) = '' then null
    when p_email !~ '@' then '***'
    else left(split_part(p_email, '@', 1), 1)
         || '***'
         || case when length(split_part(p_email, '@', 1)) > 1
                 then right(split_part(p_email, '@', 1), 1) else '' end
         || '@' || split_part(p_email, '@', 2)
  end;
$$;

create or replace function private.mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null or btrim(p_phone) = '' then null
    when length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 4 then '***'
    else '**** ' || right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 4)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The review views
--
-- security_invoker = off so the view reads the base table as its owner, with the
-- WHERE clause as the access control. That is the established pattern here and
-- it is what makes column omission possible at all.
--
-- What profiles deliberately does not carry: display_name (private by design,
-- see stage-name.test.sql), birth_year, home_city, home_location. Nothing in
-- reviewing held content needs any of them, and each is reachable through
-- admin_reveal when a specific decision does.
-- ---------------------------------------------------------------------------
create view admin_profile_review
with (security_invoker = off) as
  select
    p.id,
    p.handle,
    p.stage_name,
    p.avatar_url,
    p.bio,
    p.is_performer,
    p.is_producer,
    p.is_admin,
    p.moderation_status,
    p.eula_version,
    p.eula_accepted_at,
    p.created_at,
    p.updated_at,
    p.deleted_at
  from public.profiles p
  where (select private.is_admin_reader());

create view admin_producer_review
with (security_invoker = off) as
  select
    pp.profile_id,
    pp.verified,
    pp.created_at,
    pp.updated_at,
    private.mask_email(pp.contact_email) as contact_email_masked,
    private.mask_phone(pp.contact_phone) as contact_phone_masked,
    -- Whether a payout reference exists can matter when reading a claim. What it
    -- says never does.
    (pp.payout_ref is not null) as has_payout_ref
  from public.producer_profiles pp
  where (select private.is_admin_reader());

revoke all on admin_profile_review from anon;
revoke all on admin_producer_review from anon;
grant select on admin_profile_review, admin_producer_review to authenticated;

comment on view admin_profile_review is
  'What a console admin may read about any account without asking. Omits '
  'display_name, birth_year, home_city and home_location; those need '
  'admin_reveal, which costs a reason and an audit row.';
comment on view admin_producer_review is
  'Producer records with contact details masked to a shape rather than a value. '
  'payout_ref is not exposed here and is not revealable anywhere.';

-- ---------------------------------------------------------------------------
-- 3. The blanket policies go
--
-- After this an admin reads other people's profiles only through the view. Their
-- own row is still covered by `profiles owner select`, and every SECURITY
-- DEFINER function that reads profiles (is_admin, the guards, moderate_content)
-- is unaffected because definer functions do not consult these policies.
--
-- `profiles admin update` goes with it, and that deserves explaining because it
-- was not the plan. An UPDATE whose WHERE clause reads the table needs the SELECT
-- policies satisfied as well as the UPDATE policy, so removing the admin select
-- makes `profiles admin update` unreachable for anybody else's row: measured, a
-- cross-user admin write now affects zero rows. The admin's own row is covered by
-- `profiles owner update` and is unaffected.
--
-- Rather than leave a policy in the schema that cannot fire, it is dropped. The
-- effect is the S5 posture arriving early for this table: profile moderation goes
-- through moderate_content, which is SECURITY DEFINER and so never consulted
-- these policies, and there is no longer a raw admin write path to profiles
-- through the API at all. If one is ever wanted it should be an RPC with a reason
-- and an audit row, like every other privileged mutation here.
-- ---------------------------------------------------------------------------
drop policy "profiles admin select" on profiles;
drop policy "profiles admin update" on profiles;
drop policy "producer profile admin select" on producer_profiles;

-- ---------------------------------------------------------------------------
-- 4. The reveal
--
-- One field, one person, one reason, one audit row, and the row is written
-- before the value is returned so a reveal cannot happen without the record
-- landing first.
--
-- The audit entry records WHICH field was revealed and never the value. The log
-- is readable by every admin, so putting the phone number in it would move the
-- disclosure rather than record it. Marked not reversible, because a thing that
-- has been seen cannot be unseen and the log should not pretend otherwise.
--
-- Rate limited through private.rate_limit, the same fixed-window counter the app
-- uses for reports and claims (S11). Thirty an hour per admin is far above
-- ordinary use and far below scraping the user table one field at a time.
-- ---------------------------------------------------------------------------
create or replace function admin_reveal(
  p_profile_id uuid,
  p_field text,
  p_reason text,
  p_request_ip inet
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_value text;
begin
  if v_actor is null or not private.is_admin() then
    raise exception 'only a moderator or an owner can reveal contact details'
      using errcode = '42501';
  end if;

  if p_field not in ('email', 'contact_email', 'contact_phone',
                     'birth_year', 'home_city', 'display_name') then
    raise exception
      'that field is not revealable. payout_ref and home_location are not '
      'revealable by anyone, deliberately.'
      using errcode = '22P02';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reveal needs a reason somebody can read later'
      using errcode = '23514';
  end if;

  if not private.rate_limit('pii_reveal:' || v_actor::text, 30,
                            interval '1 hour', now()) then
    raise exception 'too many reveals in the last hour. Slow down.'
      using errcode = '54000';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_profile_id) then
    raise exception 'no account with that id' using errcode = 'P0002';
  end if;

  -- The audit row lands first. A failure after this point leaves a record of an
  -- attempt, which is the right way round.
  perform admin.append_audit(
    'pii.reveal', 'profile', p_profile_id,
    null,
    jsonb_build_object('field', p_field),
    p_reason, p_request_ip, null, false);

  if p_field = 'email' then
    select u.email into v_value from auth.users u where u.id = p_profile_id;
  elsif p_field = 'contact_email' then
    select pp.contact_email into v_value
      from public.producer_profiles pp where pp.profile_id = p_profile_id;
  elsif p_field = 'contact_phone' then
    select pp.contact_phone into v_value
      from public.producer_profiles pp where pp.profile_id = p_profile_id;
  elsif p_field = 'birth_year' then
    select p.birth_year::text into v_value
      from public.profiles p where p.id = p_profile_id;
  elsif p_field = 'home_city' then
    select p.home_city into v_value
      from public.profiles p where p.id = p_profile_id;
  else
    select p.display_name into v_value
      from public.profiles p where p.id = p_profile_id;
  end if;

  return v_value;
end;
$$;

revoke all on function admin_reveal(uuid, text, text, inet) from public, anon;
grant execute on function admin_reveal(uuid, text, text, inet)
  to authenticated, service_role;
