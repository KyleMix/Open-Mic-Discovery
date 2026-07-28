-- Public read views and the initial EULA text.
--
-- RLS cannot hide columns, so tables with private columns (profiles,
-- producer_profiles) deny non-owner selects at the base table and expose
-- a column-limited view instead. The views run as their owner (postgres),
-- so each carries the visibility and block filters explicitly.

create view public_profiles
with (security_invoker = off) as
  select
    p.id,
    p.handle,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.home_city,
    p.is_performer,
    p.is_producer,
    p.created_at
  from profiles p
  where p.deleted_at is null
    and p.moderation_status = 'approved'
    and (auth.uid() is null or not private.is_blocked_pair(auth.uid(), p.id));

create view performer_public
with (security_invoker = off) as
  select
    pp.profile_id,
    pp.disciplines,
    pp.experience,
    pp.links,
    pp.tags
  from performer_profiles pp
  where exists (select 1 from public_profiles v where v.id = pp.profile_id);

-- contact_phone and payout_ref never appear here.
create view producer_public
with (security_invoker = off) as
  select
    pr.profile_id,
    pr.contact_email,
    pr.verified
  from producer_profiles pr
  where exists (select 1 from public_profiles v where v.id = pr.profile_id);

grant select on public_profiles, performer_public, producer_public to anon, authenticated;

insert into eula_versions (version, body_md) values ('1.0', $eula$
# Open Mic Finder End User License Agreement

Version 1.0, effective July 28, 2026.

By creating an account you agree to this Agreement. If you do not agree, do not use the app.

## 1. What this app is

Open Mic Finder helps you discover open mic events and, where available, sign up to perform. Listings are provided by producers and community members and are not guaranteed to be accurate.

## 2. Zero tolerance for objectionable content and abuse

You may not post, link to, or transmit content that is: harassing, threatening, or abusive toward any person; hateful or discriminatory on the basis of race, ethnicity, religion, sex, gender identity, sexual orientation, disability, or age; sexually explicit; violent or promoting violence; illegal or promoting illegal activity; spam, scams, or deliberate misinformation, including knowingly false event listings; or impersonation of any person or venue.

We remove objectionable content and eject abusive users. Reported content is reviewed and acted on within 24 hours. Repeated or severe violations result in permanent account termination without notice.

## 3. Your content

You keep ownership of what you post. You grant us a worldwide, non-exclusive, royalty-free license to host and display it inside the app. You are responsible for what you post. Free-text content is screened by an automated filter before it goes live and may be held for review.

## 4. Reporting and blocking

Every listing and profile has a Report action. Every profile has a Block action. Blocking a user hides their content from you, server side. Use these tools; they are how the community stays usable.

## 5. Events are real-world activities

Producers, not Open Mic Finder, run the events listed here. We are not responsible for what happens at a venue, for event cancellations, or for disputes between performers and producers. Use judgment appropriate to attending live events.

## 6. Age

You must be at least 17 years old to use Open Mic Finder. Comedy content in particular may include adult language and themes.

## 7. Account deletion

You can delete your account at any time from Settings. Deletion removes your sign-in and personal data; anonymized records of past signups may be retained for the integrity of event history.

## 8. Changes

We may update this Agreement. Material changes require you to accept the new version before continuing to use the app. Each accepted version and its timestamp are recorded.

## 9. Disclaimers

The app is provided as is, without warranties of any kind. To the maximum extent permitted by law, our liability is limited to the amount you paid us in the past twelve months.

Contact: legal@openmicfinder.app
$eula$);
