-- EULA 1.1: the app is now called Open Mic Explorer.
--
-- The 1.0 text in 20260728000600_views_and_eula.sql is left untouched. It is
-- already applied and it is the exact text people accepted, so it stays as the
-- historical record. A rename changes who the agreement names as the operator,
-- so it ships as a new version and the acceptance gate in src/app/_layout.tsx
-- asks everyone to accept it once. Only the name, the contact address, and the
-- version header differ from 1.0; no term changed.

insert into eula_versions (version, body_md) values ('1.1', $eula$
# Open Mic Explorer End User License Agreement

Version 1.1, effective July 30, 2026. Replaces version 1.0, which named the app Open Mic Finder. No terms changed, only the name of the app and the contact address.

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

You must be at least 17 years old to use Open Mic Explorer. Comedy content in particular may include adult language and themes.

## 7. Account deletion

You can delete your account at any time from Settings. Deletion removes your sign-in and personal data; anonymized records of past signups may be retained for the integrity of event history.

## 8. Changes

We may update this Agreement. Material changes require you to accept the new version before continuing to use the app. Each accepted version and its timestamp are recorded.

## 9. Disclaimers

The app is provided as is, without warranties of any kind. To the maximum extent permitted by law, our liability is limited to the amount you paid us in the past twelve months.

Contact: legal@openmicexplorer.app
$eula$);
