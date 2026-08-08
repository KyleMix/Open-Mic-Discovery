# Prompt: rebuild stonedgooseproductions.com/open-mics

Paste everything in the fenced block below into Claude. It is written to
work in a fresh session with no repo access, because the marketing site
probably lives somewhere other than this repository. If you run it inside
the `Open-Mic-Discovery` repo instead, Claude will find the real copy and
screenshots and should prefer those over the summary embedded here.

Before pasting, fill in the three bracketed answers at the top of the
prompt. If you do not know the answer to the hosting question, say so in
the prompt and let Claude tell you how to find out.

---

```
You are rebuilding one page on my company website.

## Who and what

Stoned Goose Productions LLC (Olympia, Washington) is publishing a mobile
app called Open Mic Explorer. The page at
https://www.stonedgooseproductions.com/open-mics currently hosts a
web-based open mic finder I built earlier. I am replacing that page with
the app's home on the web.

## The three things I need to tell you first

1. Site platform and how I edit it: [Squarespace / Wix / WordPress /
   Webflow / a static site I deploy myself / other. Say which, and whether
   I can upload arbitrary files to the domain root.]
2. What happens to the existing web finder: [see the decision section
   below, and tell me your recommendation before you build anything.]
3. Launch state right now: the app is NOT in the stores yet. It goes to
   TestFlight and Google Play internal testing first. So no App Store or
   Play badges yet, and nothing on the page may claim you can download it
   today.

## What the app actually is (do not embellish this)

Open Mic Explorer puts open mics for music, comedy, and poetry on one map.
It is not comedy only. It serves two roles from one account:

Performers: browse a map or list of mics near them; filter by discipline,
day, distance, cost, signup method, and start time; see when each listing
was last confirmed by the person who runs it; sign up for a slot in the
app; get a push when their slot status changes; add a night to their
calendar.

Producers and venues: list a mic in about two minutes using a
plain-language schedule builder ("every other Tuesday, 8pm"); confirm the
listing is still accurate with one tap; cancel a night with a reason
performers actually see; run the signup list live from the side of the
stage, including lottery draws, running order, walk-ins, and marking
performers done.

True facts to use, and do not exceed:
- Everything is free. No in-app purchases, no subscriptions, no ads, no
  tracking, no data selling.
- Some real-world mics charge performers for a reserved slot. That money
  is paid at the venue, never in the app. The app only shows that a cost
  exists.
- Accounts are 18 and over, enforced server side.
- There is reporting, blocking, and a moderation queue with a 24 hour
  response commitment. Say this plainly somewhere; it is a trust signal,
  not a legal footnote.
- Content at launch covers the Pacific Northwest, seeded around Seattle,
  Tacoma, Portland, Olympia, and Bellingham. Do not imply national
  coverage.
- Dark interface, deliberately, so it does not light up a dark room.
- Listings stay readable offline.

Never write: "AI-powered", "the world's largest", user counts, download
counts, testimonials, press mentions, or any award. None of those are
true and inventing them is worse than a plain page.

## The decision I need you to make explicitly, before building

The existing web finder has value I might be about to throw away:

(a) People who use it today will hit whatever replaces it. If the page
    simply becomes an app advert, those people are told to install
    something instead of getting what they came for.
(b) It is probably the only thing on my domain that search engines
    associate with "open mic near me" style queries. A pure app landing
    page has nothing for a crawler to rank.

So choose between:

OPTION 1 (recommended unless the hosting makes it impossible): keep a
lightweight, crawlable public listing view on the page, and put the app
above it. Visitors see the pitch, then real upcoming mics they can read
without installing anything. Every listing carries a link into the app for
people who want to sign up. This keeps the search value, serves the person
who just wants to know what is on tonight, and turns the page into the
app's best funnel rather than a wall.

OPTION 2: full replacement with a marketing page, and a clear, kind
message for people who came for the old finder telling them where the
listings went and what to do instead. Choose this only if the platform
cannot render a listing view, or if I tell you the old finder's data is
dead.

Tell me which you recommend and why, in two or three sentences, then
build it. If you pick Option 1, you will need to ask me how the page can
read listing data (the app's backend is Supabase, and there is a public,
anonymous-readable search function, so a read-only fetch is feasible if
the platform allows custom JavaScript).

## What the page must contain either way

Structure it in this order. Every section should earn its place; a short
honest page beats a long padded one.

1. Hero. The name, one sentence that says what it does, and the primary
   action. Suggested line, improve on it if you can: "Find an open mic.
   Get on the list." Do not use a stock photo of a generic microphone on a
   purple gradient. If you have nothing real to show, use type and space.

2. What it does, split by the two roles. Performers and Producers, side by
   side or stacked on mobile. Three or four concrete capabilities each,
   written as outcomes, not feature names.

3. Screenshots. I have four real ones: a map and list view, a listing
   detail, the "going" list, and the live night screen. Ask me for the
   files. Frame them plainly. Caption each with what it shows in a handful
   of words. If I have not given you the files, leave clearly marked
   placeholders sized correctly, and tell me what to send.

4. Availability. Honest about the current state: it is in testing, here is
   how to be told when it opens, or here is the TestFlight link if I have
   given you one. Include a single email capture only if the platform
   already has a working form; do not build a form that posts nowhere.

5. Are you a producer or a venue. A short, direct section. Listing a mic is
   free, takes about two minutes, and reaches performers who are already
   looking. This audience is the reason the app has content at all, so
   treat it as a real section, not a footnote.

6. Trust and safety, briefly. Reporting, blocking, moderation within 24
   hours, 18 and over, no ads, no tracking, no data selling.

7. Support and legal footer. These are required by both app stores and
   must be real, working links:
   - Support email: [I will give you the address; it will be either
     support@stonedgooseproductions.com or an address on the same domain.
     Use exactly what I give you and nothing else.]
   - Privacy policy: /open-mics/privacy
   - Terms of use (the EULA): /open-mics/terms
   - Delete your account: /open-mics/delete-account
   I have the full text for the privacy policy, the terms, and the
   deletion page. Ask me for them rather than writing your own; they are
   already reviewed and the app's EULA references them by URL.

## Hard technical requirements

These are not stylistic. Getting them wrong breaks the app or fails store
review.

- The three sub-pages above must exist at exactly those paths, reachable
  with no login and no app install, before I submit to either store.
  Google Play tests the deletion page. Apple tests the privacy and support
  links.
- Two files must be served from the DOMAIN ROOT, not under /open-mics:
    https://www.stonedgooseproductions.com/.well-known/apple-app-site-association
    https://www.stonedgooseproductions.com/.well-known/assetlinks.json
  These are what make links open in the app instead of the browser. The
  first must be served as application/json with no file extension and no
  redirect. Many hosted site builders cannot do this. If mine cannot, say
  so plainly and early, and tell me the options (a subdomain I control, a
  reverse proxy, or moving the site) rather than building around it
  silently.
- Decide and tell me whether the canonical host is www or the bare domain,
  and make the other one redirect. Deep link configuration has to name the
  exact host, so an inconsistent www is a real bug, not a cosmetic one.
- The page must work with JavaScript disabled for at least the text
  content and the legal links.

## Style

- Dark theme, matching the app: near-black background around #0B0B0F, with
  a blue accent around #4DA6FF. Poppins, or a close web-safe fallback.
- Mobile first. Most visitors will arrive on a phone, some while standing
  outside a venue.
- Accessible: real heading order, alt text on every image, focus states,
  and text that passes AA contrast on the dark background.
- No em dashes anywhere in the copy. Use commas, colons, parentheses, or
  separate sentences.
- Plain, specific language. No marketing throat-clearing, no "revolutionize",
  no "seamless", no exclamation marks.
- Fast: no web fonts beyond one family, no tracking scripts, no cookie
  banner (there is nothing to consent to if you add no trackers, and
  adding trackers here would contradict the app's own privacy claims).

## What to give me

1. Your recommendation on the Option 1 versus Option 2 decision, first, in
   a few sentences.
2. The page itself, in the format my platform actually accepts: a single
   self-contained HTML file if I deploy static files, or clearly separated
   content blocks with the copy and the embed code if I am pasting into a
   site builder. Ask which before you write it if I have not been clear.
3. A short list of exactly what I still need to hand you or upload:
   screenshot files, the legal text, the support address, the
   .well-known files.
4. The redirect or migration note for anyone who bookmarked the old
   finder, if you chose Option 2.

Ask me anything genuinely ambiguous before building. Do not invent facts
about the app to fill space.
```
