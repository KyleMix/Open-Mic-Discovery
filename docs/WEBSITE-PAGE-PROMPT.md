# SUPERSEDED, DO NOT PASTE AS WRITTEN

Reading `KyleMix/stoned_goose_website` on 2026-08-08 invalidated the premise
of this prompt. It was written to "replace a web-based open mic finder with
an app landing page". That is not the situation:

- The website already has a page at `/open-mics` branded **Open Mic
  Explorer**, the same name as the app.
- It carries **85 real Pacific Northwest open mic records** in a Sveltia CMS
  collection (`content/open-mics/`), with a 147-record Google Sheet import as
  fallback, an interactive map, a submission dialog, and schema.org markup.
- The app, meanwhile, is about to go to store reviewers with **10 invented
  venues** (The Rusty Fret, Blue Heron Coffee, and so on).

So this is not a replacement, it is a convergence: one product name, one
region, one purpose, two data stores that will diverge the moment both are
live. The decision that has to come first is which store is canonical, and
it is the owner's call. See the note at the bottom of
`docs/CHANGELOG-READINESS.md`.

Everything below is retained because the app facts, the hard technical
requirements, and the style constraints all still hold. The framing of the
"Option 1 versus Option 2" decision does not.

---

# Prompt: rebuild stonedgooseproductions.com/open-mics

For Claude Code running in the **website** repository, with this repo
(`KyleMix/Open-Mic-Discovery`) added as a second source so it can read the
real copy and assets rather than inventing them.

## Before you paste

1. In the website Claude Code session, add this repo so the paths below
   resolve. Claude Code on the web can do it with `add_repo` for
   `KyleMix/Open-Mic-Discovery`; ask it to add the repo and clone it. If
   that is unavailable, copy the four directories listed under "What to
   take from the app repo" into the website repo by hand first, and tell
   Claude they are there instead.
2. Regenerate the legal pages in this repo so what the website copies is
   current: `npm run legal:export`. It rebuilds `web/legal/terms.md` from
   whichever EULA version the migrations publish, and `web/legal/privacy.md`
   from the hostable privacy policy.
3. Fill in the two bracketed answers in the prompt.

---

```
You are rebuilding one page and its sub-pages on the Stoned Goose
Productions website, and wiring up two files the company's mobile app
depends on.

## Context

Stoned Goose Productions LLC (Olympia, Washington) is publishing a mobile
app called Open Mic Explorer. The page at
https://www.stonedgooseproductions.com/open-mics currently hosts a
web-based open mic finder built earlier. That page becomes the app's home
on the web.

The app's repository is available to you in this session as
`Open-Mic-Discovery`. Read from it rather than inventing anything. In
particular do not write your own privacy policy or terms text: they exist,
they are reviewed, and the app links to them by URL.

## What to take from the app repo

| Source in Open-Mic-Discovery | Where it must end up |
| --- | --- |
| `web/legal/privacy.md` | rendered at `/open-mics/privacy` |
| `web/legal/terms.md` | rendered at `/open-mics/terms` |
| `web/delete-account/index.html` | served at `/open-mics/delete-account` |
| `web/.well-known/apple-app-site-association` | served at the DOMAIN ROOT `/.well-known/apple-app-site-association` |
| `web/.well-known/assetlinks.json` | served at the DOMAIN ROOT `/.well-known/assetlinks.json` |
| `marketing/screenshots/*.png` | four real app screenshots for the page |
| `docs/store/STORE_LISTING.md` | approved marketing copy, reuse its language |

The two markdown legal files carry a generated-by banner. Render them,
do not rewrite them. If your site framework needs HTML rather than
markdown, convert at build time and keep the source file so a regeneration
in the app repo can be re-copied without redoing the prose. Strip the HTML
comment banner from what visitors see, but keep it in the repo file.

## What the app actually is (do not embellish)

Open Mic Explorer puts open mics for music, comedy, and poetry on one map.
It is not comedy only. One account serves two roles.

Performers: browse a map or list of mics nearby; filter by discipline, day,
distance, cost, signup method, and start time; see when each listing was
last confirmed by the person who runs it; sign up for a slot in the app;
get a push when their slot status changes; add a night to their calendar.

Producers and venues: list a mic in about two minutes with a
plain-language schedule builder ("every other Tuesday, 8pm"); confirm the
listing is still accurate with one tap; cancel a night with a reason
performers actually see; run the signup list live from the side of the
stage, including lottery draws, running order, walk-ins, and marking
performers done.

True and usable:
- Everything is free. No in-app purchases, no subscriptions, no ads, no
  tracking, no data selling.
- Some real-world mics charge performers for a reserved slot. That money is
  paid at the venue, never in the app. The app only shows a cost exists.
- Accounts are 18 and over, enforced server side.
- Reporting, blocking, and a moderation queue with a 24 hour response
  commitment. Say this plainly; it is a trust signal, not a footnote.
- Launch coverage is the Pacific Northwest, seeded around Seattle, Tacoma,
  Portland, Olympia, and Bellingham. Do not imply national coverage.
- Dark interface on purpose, so it does not light up a dark room.
- Listings stay readable offline.
- The app is NOT in the stores yet. It goes to TestFlight and Google Play
  internal testing first. No store badges, and nothing may suggest it is
  downloadable today.

Never write: "AI-powered", "the world's largest", user or download counts,
testimonials, press mentions, awards. None are true.

## Decide this first, and tell me before you build

The existing web finder has value I may be about to discard:

(a) People who use it today will land on whatever replaces it. If the page
    becomes a pure app advert, they are told to install something instead
    of getting the answer they came for.
(b) It is probably the only thing on this domain that search engines
    associate with "open mic near me" queries. An app landing page gives a
    crawler nothing to rank.

Choose:

OPTION 1 (recommended unless the stack makes it impossible): keep a
lightweight, crawlable public listing view on the page with the app pitch
above it. Visitors get the pitch, then real upcoming mics they can read
without installing anything, each linking into the app for signup. Keeps
the search value, serves the person who just wants to know what is on
tonight, and turns the page into the app's funnel rather than a wall.

OPTION 2: full replacement, plus a clear and kind message telling former
finder users where the listings went. Choose this only if the stack cannot
render a listing view, or if the old finder's data is dead.

If you pick Option 1: the app's backend is Supabase and there is a public,
anonymous-readable Postgres function for discovery. Look at
`src/features/discovery/queries.ts` and the `search_discover` RPC in
`supabase/migrations/20260807000300_search_discover.sql` for the shape.
Read it with the anon key only. Ask me for the production URL and anon key
rather than guessing, and note that the production project may not exist
yet, in which case build the view against a documented fixture and leave a
single clearly marked place to switch it on.

## Page structure

Every section earns its place. A short honest page beats a padded one.

1. Hero: the name, one sentence saying what it does, the primary action.
   Candidate line, improve on it if you can: "Find an open mic. Get on the
   list." No stock photo of a microphone on a purple gradient. If there is
   nothing real to show, use type and space.
2. What it does, split by role. Performers and Producers, side by side,
   stacked on mobile. Three or four concrete outcomes each, not feature
   names.
3. Screenshots. Four real ones exist: discover, mic detail, going, live.
   Frame them plainly, caption each in a handful of words.
4. Availability. Honest about testing status. Add an email capture only if
   the site already has a working form endpoint; never build a form that
   posts nowhere.
5. For producers and venues. Free, about two minutes, reaches performers
   already looking. This audience is why the app has content, so give it a
   real section.
6. Trust and safety, briefly: reporting, blocking, 24 hour moderation, 18
   and over, no ads, no tracking, no data selling.
7. Footer with the required links: support email
   [support@stonedgooseproductions.com], /open-mics/privacy,
   /open-mics/terms, /open-mics/delete-account.

## Hard technical requirements

Not stylistic. Getting these wrong breaks the app or fails store review.

- The three sub-pages must exist at exactly those paths, reachable with no
  login and no app install, before submission. Google Play tests the
  deletion page. Apple tests the privacy and support links.
- The two `.well-known` files go at the DOMAIN ROOT, not under
  `/open-mics`. `apple-app-site-association` must be served as
  `application/json`, with no file extension and no redirect. If the stack
  cannot do this, say so immediately and loudly rather than building around
  it: without these, links do not open in the app.
- `www` is canonical. The app declares `applinks:www.stonedgooseproductions.com`
  and an Android intent filter for host `www.stonedgooseproductions.com`
  with path prefix `/open-mics/mic/`. Make the bare domain 301 to `www`.
  Do not change the host casing or add a trailing-slash redirect on
  `/open-mics/mic/*`, because the app's deep link matching is exact.
- `/open-mics/mic/<id>` URLs are shared from inside the app and will be
  opened by people without the app installed. They must render something
  useful: at minimum the page with an explanation, ideally the specific
  mic. Do not 404 them.
- The delete-account page reads its backend URL from a `data-function-url`
  attribute on `<body>` and disables itself while that is a placeholder.
  Preserve that behavior exactly; it is deliberate, so an unfinished setup
  fails visibly instead of silently accepting an email address.
- The page must work with JavaScript disabled for at least the text
  content and the legal links.

## Style

- Dark theme matching the app: background near #0B0B0F, blue accent near
  #4DA6FF, Poppins or a close fallback.
- Mobile first. Many visitors arrive on a phone, some standing outside a
  venue.
- Accessible: correct heading order, alt text on every image, visible focus
  states, AA contrast on the dark background.
- No em dashes anywhere in the copy. Use commas, colons, parentheses, or
  separate sentences.
- Plain and specific. No "revolutionize", no "seamless", no exclamation
  marks.
- Fast: one font family, no tracking scripts, no cookie banner. Adding
  trackers here would contradict the app's own privacy claims and the
  filed store declarations.

## Constraints on how you work

- Match the existing site's framework, build, and conventions. Read the
  repo before writing. Do not introduce a new framework, CSS system, or
  dependency without telling me why and getting agreement.
- Do not delete the old finder's code until the replacement is working.
  If Option 2, move it aside in one commit and remove it in another, so
  reverting is cheap.
- Commit in logical chunks with clear messages. Do not force push.
- Verify: build the site, and check the three sub-page routes and the two
  `.well-known` URLs actually resolve locally with the right content type
  before you claim it is done.

## Deliver

1. Your Option 1 versus Option 2 recommendation first, in a few sentences.
2. The implementation.
3. Exactly what you still need from me: the Supabase URL and anon key if
   Option 1, the Apple Team ID and Android SHA-256 fingerprints for the
   `.well-known` files (both are currently `TODO_` placeholders in the app
   repo and I have to paste them in), and anything else.
4. How to redeploy the legal pages when the app repo regenerates them.

Ask about anything genuinely ambiguous before building. Do not invent facts
about the app to fill space.
```
