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

The job is now three things, not one: repurpose the page, relocate the map,
and stand up the five files both app stores require (privacy, terms,
account deletion, and the two `.well-known` association files). The last of
those was previously marked optional here; the owner asked for it, so it is
not.

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
- Five files both app stores require go live on this domain: three pages
  under /open-mics, and two association files at the domain root. Detailed
  below under "Also required".

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

## Also required: the five store files

These are not optional and not for later. Apple and Google both check them,
and the app cannot be submitted until they are live on this domain.

### The three pages

| Fetch from the app repo | Serve at |
| --- | --- |
| `$BASE/web/legal/privacy.md` | `/open-mics/privacy` |
| `$BASE/web/legal/terms.md` | `/open-mics/terms` |
| `$BASE/web/delete-account/index.html` | `/open-mics/delete-account` |

All three must be reachable with no login, no app install, and no
JavaScript required to read the text. Google Play tests the deletion page.
Apple tests the privacy link and the support contact.

**The two markdown files are generated.** They are produced in the app repo
by `npm run legal:export`, and each carries an HTML comment banner naming
its source. The terms file is extracted from whichever EULA version the
app's migrations publish, because the agreement lives in the database and
the app renders it from there: if this page and that row disagree, the
website is showing an agreement nobody accepted. So render them, never
rewrite them, never fix a typo in them here. Keep the banner in the repo
file and strip it from what visitors see. When the app repo regenerates
them, re-fetch.

Style them to match the site, but do not restructure the content, reorder
sections, or summarize. The text is reviewed as it stands.

### The deletion page has one behavior you must not "fix"

`web/delete-account/index.html` reads its backend URL from a
`data-function-url` attribute on `<body>`, which currently holds the
placeholder `https://YOUR-PROJECT-REF.supabase.co/functions/v1/deletion-request`.
While that value is unset or still a placeholder, the page deliberately
disables its form and says why.

That is not a bug and it is not an unfinished state to tidy up. It exists
so a half-finished deployment fails visibly, instead of silently accepting
someone's email address for a deletion request that goes nowhere. Preserve
it exactly, whether you port the page into a Next route or serve the HTML
as-is.

Leave the placeholder in place. I will supply the real Supabase project
reference. Tell me where you put the attribute so I know what to edit.

### The two domain-root files

| Fetch from the app repo | Serve at |
| --- | --- |
| `$BASE/web/.well-known/apple-app-site-association` | `/.well-known/apple-app-site-association` |
| `$BASE/web/.well-known/assetlinks.json` | `/.well-known/assetlinks.json` |

**At the domain root, not under /open-mics.** This is not negotiable and
not a convention: it is where iOS and Android look, and nowhere else.
`public/.well-known/` is the right home given `output: "export"`. Confirm
the files actually appear in `out/.well-known/` after a build, because a
dot-directory under `public/` is exactly the kind of thing a bundler
quietly skips.

`apple-app-site-association` has **no file extension** and must be served
as `Content-Type: application/json`, with no redirect in front of it. This
repo already solves this exact class of problem: `public/_headers` forces
`Content-Type: image/png` on extensionless OG image routes. Add a rule in
the same spirit, and mirror it in `vercel.json` the way the existing
redirects are mirrored, so both hosts behave identically.

Do not rename either file, do not add `.json` to the Apple one, and do not
pretty-print or reformat their contents.

### The placeholders in them are mine to fill

Both files contain `TODO_` values I have to supply from accounts that do
not exist yet:

- `apple-app-site-association`: `TODO_TEAM_ID`, my Apple Developer Team ID.
- `assetlinks.json`: `TODO_SHA256_CERT_FINGERPRINT`, the Android signing
  certificate fingerprint.

Leave them exactly as they are. Do not invent, guess, or generate
placeholder-looking values that could pass for real. Tell me the file path
and line for each so I can paste mine in.

Deep links will not verify until those are real. That is expected right
now, and it is not a reason to hold the rest of this work.

## Verify before claiming done

Build the site and check the BUILT OUTPUT, not the dev server. Several of
these can pass in dev and fail in a static export.

The page work:

- /open-mics/map renders all 85 mics, the map works, the submit dialog
  works, and the ItemList schema is present there.
- /open-mics is the app page, links clearly to the map, and reads cleanly
  at a 390px viewport without pinch zoom.
- No route still expects a map at /open-mics. Grep for "/open-mics" and
  account for every hit.
- The PDF downloads and opens.

The store files:

- /open-mics/privacy, /open-mics/terms, and /open-mics/delete-account all
  resolve and show the right content, with JavaScript disabled for the text.
- The delete-account form is still disabled, with its explanation visible,
  because the function URL is still a placeholder. If the form is
  submittable, you broke the safety behavior.
- `out/.well-known/` exists and contains both files after a build. Check
  the directory literally; do not assume public/ copied it.
- `apple-app-site-association` is served with `Content-Type:
  application/json`, has no extension, and is not redirected. Verify with a
  real request against the built output, for example
  `curl -sI localhost:PORT/.well-known/apple-app-site-association`, and
  paste the status line and content type into your summary.
- Both files still contain their TODO_ placeholders, unmodified.

The repo:

- `npm run typecheck`, `npm run lint`, `npm test`, and content:validate all
  pass.
- Lighthouse on both routes has not regressed.

## Deliver

1. The implementation, in logical commits, no force pushes. Keep the map
   move, the announcement page, and the store files as separate commits so
   any one can be reverted alone.
2. A list of every internal link, sitemap entry, and piece of metadata you
   changed for the move, so I can check nothing was missed.
3. The exact file path and line for each thing I have to fill in myself:
   the `data-function-url` attribute, `TODO_TEAM_ID`, and
   `TODO_SHA256_CERT_FINGERPRINT`.
4. The curl output proving the Apple file's content type.

Ask before building if anything is genuinely ambiguous. In particular, if
following this would mean deleting mic content, stop and ask.

Do not report the store files as done on the strength of having created
them. Apple and Google fetch these over HTTP and judge what comes back, so
"the file is in the repo" and "the file is served correctly" are different
claims, and only the second one counts.
```
