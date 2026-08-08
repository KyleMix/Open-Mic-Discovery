# Prompt: make /open-mics the app announcement page

For Claude Code in `KyleMix/stoned_goose_website`. Rewritten 2026-08-08.

Owner decision, confirmed after the ambiguity was raised: `/open-mics`
becomes the app announcement, showing the marketing one-sheet and a
coming-soon-to-the-stores note, and the mic map comes off that page.

**What that does and does not mean.** It replaces the page. It does not
delete the feature: the map component, the 85 CMS records, the submit
dialog, and the sync scripts all keep working, they just live at a
different route. Deleting a working feature and its data is a separate,
irreversible decision that was not asked for, so the prompt relocates
instead. If the map really should be gone entirely, that is a one-line
change to say so.

**The cost, stated once.** `/open-mics` is the page that carries this
domain's search authority for open mic queries, and it is what people
currently arrive for. Moving the map off it means the ranking URL becomes
an announcement for a product that is not out yet. The relocation below
keeps the content on the site and links it prominently from the page with
the authority, which recovers much of that, but not all of it.

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
You are repurposing one live page on the Stoned Goose Productions website.

## The change

Today, /open-mics (app/(site)/open-mics/page.tsx) is a map of 85 real
Pacific Northwest open mics: CMS managed, with a submit dialog and
schema.org markup. It is live and it ranks.

After this change:

- /open-mics is the announcement page for the Open Mic Explorer mobile
  app: the marketing one-sheet, and the fact that it is coming soon to the
  App Store and Google Play.
- The map moves to /open-mics/map, intact.

Do NOT delete the map component, the content/open-mics collection, the
submit dialog, the sync scripts, or any of the 85 records. This is a move,
not a removal. If you find yourself deleting content files, stop and ask.

## Moving the map correctly

This is the part with the sharp edges. Work through all of it.

1. Create /open-mics/map rendering exactly what /open-mics renders today:
   the header, the fine print disclaimer, the section renderers, the
   OpenMicExplorer component, and the submit dialog.
2. Move the schema.org markup with it. The ItemList built by
   buildMicListSchema describes the mics, so it belongs on the page that
   shows the mics, not on the app announcement. Breadcrumbs need updating
   for the new depth.
3. Move `alternates.canonical` to "/open-mics/map" on that page, and give
   /open-mics its own canonical.
4. The existing opengraph-image.tsx at app/(site)/open-mics/ was drawn for
   the map. Move or copy it to the map route and give the app announcement
   its own, so a shared link previews the right thing.
5. Update every internal link and any nav entry that points at /open-mics
   expecting a map. Search the repo for "/open-mics" and check each hit.
6. Update the sitemap so both routes are listed.
7. Do NOT redirect /open-mics to /open-mics/map. That URL is now the app
   page on purpose. Instead, link to the map from it, clearly and high up,
   because a large share of arrivals are people looking for mics and they
   must not hit a dead end.

## Building the announcement page

### What it says

1. Open Mic Explorer, the app: what it is, from the one-sheet.
2. It is coming soon to the App Store and Google Play.
3. A route to the map, for the people who came here for that.

### Where the assets are

Fetch from the app repo on main. Both repos are public, so no repo
attachment is needed. Commit what you use into this repo; do not hotlink
raw.githubusercontent from the live site.

  BASE=https://raw.githubusercontent.com/KyleMix/Open-Mic-Discovery/main

  $BASE/marketing/one-sheet/open-mic-explorer.pdf
  $BASE/marketing/one-sheet/pages/page-1.webp .. page-5.webp
  $BASE/marketing/one-sheet/open-mic-explorer.txt
  $BASE/marketing/screenshots/{discover,mic-detail,going,live}.png

### How to present the one-sheet, and why it matters

Do NOT simply drop five US Letter page images on the page. The sheet is two
columns of small body text. At a 390px viewport those pages need pinch zoom
to read, and most visitors to this page are on a phone. An unreadable wall
of images is worse than no section, and this is now the whole page rather
than a section of one, so it has to carry its own weight.

Build it in this order:

1. A web-native summary in responsive HTML, written from
   `open-mic-explorer.txt`. The strongest points: music, comedy and poetry
   on one map; listings show when the host last confirmed them so stale
   mics cannot hide; signup and running the night are built in; one account
   performs and hosts; free, with nothing behind a purchase. Use the four
   app screenshots here, not the page renders: they are real UI and they
   read at any size.
2. The full sheet as a page gallery, tap to enlarge, for anyone who wants
   everything.
3. A plain "Download the feature overview (PDF, 5 pages, 700 KB)" link.

If you cut one, cut the gallery.

### The coming-soon line

Say plainly: coming soon to the App Store and Google Play.

Do NOT use the App Store or Google Play download badges. Both stores'
badge guidelines cover released apps, and a badge on an unreleased app
implies a link that does not exist. Plain text, no badge art, no fake
button, no link to a store page that is not live.

If this repo already has a working form endpoint, one "tell me when it is
out" capture is welcome. Do not build a form that posts nowhere.

### Two things in the sheet to handle honestly

1. Page 5 says "Seattle is the first Open Mic Explorer city." Your map at
   /open-mics/map covers the whole Pacific Northwest. With the two now on
   separate pages this is less jarring, but the link between them still
   needs an honest label: the map is the crew's Pacific Northwest list, the
   app is a separate product starting in Seattle, and a host anywhere can
   list a mic in it today.
2. The performer walkthrough opens "Every mic near you is visible
   immediately." That describes what the app does, not what it contains:
   the app launches with no listings and mic owners add their own. Do not
   repeat that line, and do not imply the app arrives holding the mics on
   the map. To a performer the honest pitch is that it is new. To a host it
   is that they can list their room now.

## Style

- Match this repo exactly: Next 15 app router, Tailwind config, existing
  component patterns, content/CMS conventions. Read before writing. No new
  framework, CSS system, or dependency without asking first.
- Match the existing voice: dry and direct. No "revolutionize", no
  "seamless", no exclamation marks.
- No em dashes. Commas, colons, parentheses, or separate sentences.
- Accessible: correct heading order, real alt text on every render and
  screenshot (describe what it shows, not "page 3"), visible focus states,
  AA contrast. The gallery must be keyboard operable and close on Escape.
- Images lazy loaded with width and height set, so 600 KB of renders does
  not shift layout.
- No tracking scripts, no cookie banner.
- Contact address if you need one: kyle@stonedgooseproductions.com. There is
  no support@ or legal@ alias; do not invent one.

## Optional, only if you want it done in the same pass

Not needed for this announcement, required before the app is submitted to
either store. Skip it and say so if you would rather keep this change
small:

  $BASE/web/legal/privacy.md          -> /open-mics/privacy
  $BASE/web/legal/terms.md            -> /open-mics/terms
  $BASE/web/delete-account/index.html -> /open-mics/delete-account
  $BASE/web/.well-known/apple-app-site-association -> DOMAIN ROOT
  $BASE/web/.well-known/assetlinks.json            -> DOMAIN ROOT

The markdown files are generated in the app repo by `npm run legal:export`
and carry a do-not-edit banner: render them, never rewrite them. The Apple
file has no extension and must be served as application/json, which
public/_headers already does for extensionless OG image routes. Both
.well-known files still contain TODO_ placeholders for the Apple Team ID
and Android fingerprints; leave them and tell me.

## Verify before claiming done

Build the site and confirm in the built output:

- /open-mics/map renders all 85 mics, the map works, the submit dialog
  works, and the ItemList schema is present there.
- /open-mics is the app page, links clearly to the map, and reads cleanly
  at a 390px viewport without pinch zoom.
- No route still expects a map at /open-mics. Grep the repo for
  "/open-mics" and account for every hit.
- The PDF downloads and opens.
- `npm run typecheck`, `npm run lint`, `npm test`, and content:validate all
  pass.
- Lighthouse on both routes has not regressed.

## Deliver

1. The implementation, in logical commits, no force pushes. Keep the move
   and the new page as separate commits so either can be reverted alone.
2. A list of every internal link, sitemap entry, and piece of metadata you
   changed for the move, so I can check nothing was missed.
3. Say explicitly whether you did the optional legal routes or skipped them.

Ask before building if anything is genuinely ambiguous. In particular, if
following this would mean deleting mic content, stop and ask.
```
