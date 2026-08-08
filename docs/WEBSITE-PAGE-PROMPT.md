# Prompt: announce the app on stonedgooseproductions.com/open-mics

For Claude Code in `KyleMix/stoned_goose_website`. Rewritten 2026-08-08
after the owner scaled the job down: the page announces the app with the
marketing one-sheet and a coming-soon-to-the-stores note. The earlier
five-job build-out is not what is being asked for now.

**Assumption, stated because it is the one thing that could be wrong:** the
existing map of 85 real mics stays, and the app announcement is added to
the page. The site is live and that map is what people come for, so
removing it is not something to infer from a short instruction. If the map
really should go, say so and this becomes a much smaller and much more
destructive change.

Assets are on `main` in the app repo, fetchable without attaching anything:

```
BASE=https://raw.githubusercontent.com/KyleMix/Open-Mic-Discovery/main
$BASE/marketing/one-sheet/open-mic-explorer.pdf      original, 698 KB, 5 pages
$BASE/marketing/one-sheet/pages/page-1..5.webp       1400px renders, 604 KB total
$BASE/marketing/one-sheet/open-mic-explorer.txt      extracted copy
$BASE/marketing/screenshots/{discover,mic-detail,going,live}.png
```

---

```
You are adding an app announcement to an existing, live page on the Stoned
Goose Productions website. You are not rebuilding the page.

## What exists and stays

This repo's /open-mics page (app/(site)/open-mics/page.tsx) is Open Mic
Explorer: a working map of 85 real Pacific Northwest open mics, CMS
managed, with a submit dialog and schema.org markup. It is live. It stays.
Do not remove, demote below the fold, or restructure it.

## What to add

Stoned Goose Productions is publishing a mobile app of the same name. Add a
section to this page that does two things:

1. Presents the marketing one-sheet ("Open Mic Explorer: Feature Overview",
   5 pages).
2. Says it is coming soon to the App Store and Google Play.

That is the whole job.

## Where the assets are

Fetch these from the app repo on main. Both repos are public, so no repo
attachment is needed:

  BASE=https://raw.githubusercontent.com/KyleMix/Open-Mic-Discovery/main

  $BASE/marketing/one-sheet/open-mic-explorer.pdf       the original
  $BASE/marketing/one-sheet/pages/page-1.webp .. page-5.webp
  $BASE/marketing/one-sheet/open-mic-explorer.txt       extracted copy
  $BASE/marketing/screenshots/discover.png              app screenshots
  $BASE/marketing/screenshots/mic-detail.png
  $BASE/marketing/screenshots/going.png
  $BASE/marketing/screenshots/live.png

Commit whatever you use into this repo. Do not hotlink raw.githubusercontent
from the live site.

## How to present the one-sheet, and why it matters

Do NOT simply drop five US Letter page images on the page and call it done.
The sheet is two columns of small body text. At a 400px viewport those
pages are unreadable without pinch zoom, and most visitors to this page are
on a phone. An unreadable wall of images is worse than no section.

Build it in this order of preference:

1. A short, web-native summary in responsive HTML, written from
   `open-mic-explorer.txt`. Pull the strongest few points: three scenes on
   one map, freshness confirmation so stale mics cannot hide, signup and
   live running built in, one account for performing and hosting, free with
   nothing behind a purchase. Use the app screenshots here rather than the
   page renders; they are real UI and they read at any size.
2. The full sheet available as a page gallery, click or tap to enlarge, so
   someone who wants everything can read it.
3. A plain "Download the feature overview (PDF, 5 pages)" link. Say it is a
   PDF and say how big it is.

If you have to cut one, cut the gallery. Keep the summary and the download.

## The coming-soon line

Say plainly: coming soon to the App Store and Google Play.

Do NOT use the App Store or Google Play download badges. Both stores'
marketing guidelines cover released apps, and a badge on an unreleased app
implies a link that does not exist. Plain text, no badge art, no fake
button, no link to a store page that is not live.

If this repo already has a working form endpoint, one "tell me when it is
out" capture is welcome. Do not build a form that posts nowhere.

## Two contradictions to handle, not ignore

Both come from putting this specific sheet on this specific page.

1. Page 5 of the sheet says "Seattle is the first Open Mic Explorer city."
   The map on this same page lists mics in Bellingham, Tacoma, Portland,
   Vancouver, Olympia, Blaine, and Chehalis. Read side by side that looks
   wrong. Resolve it in the surrounding copy: this map is the crew's
   Pacific Northwest list, the app is a separate product starting in
   Seattle, and hosts anywhere can list a mic in it today. One or two
   sentences, not a disclaimer block.

2. The sheet's performer walkthrough opens with "Every mic near you is
   visible immediately." That describes what the app does, not what it
   contains: the app launches with no listings, and mic owners add their
   own. Do not repeat that line in your summary copy, and do not imply the
   app arrives holding the 85 mics on this page. The honest pitch to a
   performer is that it is new; the honest pitch to a host is that they can
   list their room now.

## Style

- Match this repo exactly: Next 15 app router, Tailwind config, existing
  component patterns, content/CMS conventions. Read before writing. No new
  framework, CSS system, or dependency without asking first.
- Match the page's existing voice: dry and direct. No "revolutionize", no
  "seamless", no exclamation marks.
- No em dashes. Commas, colons, parentheses, or separate sentences.
- Accessible: correct heading order, real alt text on every page render and
  screenshot (describe what the page says, not "page 3"), visible focus
  states, AA contrast. The gallery must be keyboard operable and closeable
  with Escape.
- Images lazy loaded with width and height set, so adding 600 KB of renders
  does not shift layout or slow the page people came for.
- No tracking scripts, no cookie banner.
- Contact address, if you need one: kyle@stonedgooseproductions.com. There
  is no support@ or legal@ alias; do not invent one.

## Optional, only if you want it done in the same pass

Not required for this announcement, but required before the app is
submitted to either store. Skip it and say so if you would rather keep this
change small:

  $BASE/web/legal/privacy.md         -> /open-mics/privacy
  $BASE/web/legal/terms.md           -> /open-mics/terms
  $BASE/web/delete-account/index.html -> /open-mics/delete-account
  $BASE/web/.well-known/apple-app-site-association -> served at the DOMAIN ROOT
  $BASE/web/.well-known/assetlinks.json            -> served at the DOMAIN ROOT

The two markdown files are generated in the app repo by `npm run
legal:export` and carry a do-not-edit banner; render them, never rewrite
them. The Apple file has no extension and must be served as
application/json, which `public/_headers` already does for extensionless OG
image routes. Both .well-known files still contain TODO_ placeholders for
the Apple Team ID and Android fingerprints; leave them and tell me.

## Verify before claiming done

Build the site and confirm in the built output:

- /open-mics still renders all 85 mics and the map still works.
- The new section reads cleanly at a 390px viewport without pinch zoom.
- The PDF downloads and opens.
- `npm run typecheck`, `npm run lint`, `npm test`, and content:validate all
  pass.
- Lighthouse on /open-mics has not regressed, given this adds images to a
  live page.

## Deliver

1. The implementation, in logical commits, no force pushes.
2. Anything you left as a placeholder or could not resolve.
3. Say explicitly whether you did the optional legal routes or skipped them.

Ask before building if anything here is genuinely ambiguous.
```
