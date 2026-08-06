-- EULA 1.2: the app is now called Open Mic Explorer.
--
-- Carries forward 1.1 verbatim (18+ age gate, web deletion path) and changes
-- only the name of the app. 1.0 and 1.1 are left untouched: they are already
-- applied, they are the exact text people accepted, and profiles.eula_version
-- references them. Publishing a new version routes every existing user through
-- the acceptance gate on next launch, which is the designed behavior.
--
-- The contact address and the deletion URL still sit on openmicfinder.app.
-- That domain hosts the live delete-account page, the association files, and
-- the privacy and terms pages, so it is deliberately not renamed here. See
-- docs/DEPLOY_WEB.md for what moving it would involve.

insert into eula_versions (version, body_md) values ('1.2', $eula$
# Open Mic Explorer End User License Agreement

Version 1.2, effective July 30, 2026. Replaces version 1.1, which named the app Open Mic Finder. No terms changed, only the name of the app.

By creating an account you agree to this Agreement. If you do not agree, do not use the app.

## 1. What this app is

Open Mic Explorer helps you discover open mic events and, where available, sign up to perform. Listings are provided by producers and community members and are not guaranteed to be accurate.

## 2. Zero tolerance for objectionable content and abuse

You may not post, link to, or transmit content that is: harassing, threatening, or abusive toward any person; hateful or discriminatory on the basis of race, ethnicity, religion, sex, gender identity, sexual orientation, disability, or age; sexually explicit; violent or promoting violence; illegal or promoting illegal activity; spam, scams, or deliberate misinformation, including knowingly false event listings; or impersonation of any person or venue.

We remove objectionable content and eject abusive users. Reported content is reviewed and acted on within 24 hours. Repeated or severe violations result in permanent account termination without notice.

## 3. Your content

You keep ownership of what you post. You grant us a worldwide, non-exclusive, royalty-free license to host and display it inside the app. You are responsible for what you post. Free-text content is screened by an automated filter before it goes live and may be held for review.

## 4. Reporting and blocking

Every listing and profile has a Report action. Every profile has a Block action. Blocking a user hides their content from you, server side. Use these tools; they are how the community stays usable.

## 5. Events are real-world activities

Producers, not Open Mic Explorer, run the events listed here. We are not responsible for what happens at a venue, for event cancellations, or for disputes between performers and producers. Use judgment appropriate to attending live events.

## 6. Age

You must be at least 18 years old to use Open Mic Explorer. Comedy content in particular may include adult language and themes.

## 7. Account deletion

You can delete your account at any time from Settings, or from the web at openmicfinder.app/delete-account. Deletion removes your sign-in and personal data; anonymized records of past signups may be retained for the integrity of event history.

## 8. Changes

We may update this Agreement. Material changes require you to accept the new version before continuing to use the app. Each accepted version and its timestamp are recorded.

## 9. Disclaimers

The app is provided as is, without warranties of any kind. To the maximum extent permitted by law, our liability is limited to the amount you paid us in the past twelve months.

Contact: legal@openmicfinder.app
$eula$);

-- The age gate error message users see, renamed alongside the agreement.
create or replace function private.enforce_age_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gate constant integer := 18;
  current_year integer := extract(year from now())::integer;
begin
  -- Server-side flows (seed, service role, admin repair) are exempt; every
  -- end-user write path carries auth.uid().
  if auth.uid() is null or private.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.birth_year is null then
    raise exception 'birth year is required'
      using errcode = '23514';
  end if;
  -- On update, null stays allowed: account deletion anonymizes the column.
  if new.birth_year is not null and current_year - new.birth_year < gate then
    raise exception 'you must be at least % to use Open Mic Explorer', gate
      using errcode = '23514';
  end if;
  return new;
end;
$$;
