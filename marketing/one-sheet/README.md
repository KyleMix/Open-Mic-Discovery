# Open Mic Explorer one-sheet

Source: `Open_Mic_Explorer.pdf`, "Feature Overview", August 2026, 5 pages,
US Letter. Supplied by the owner 2026-08-08 for the website's `/open-mics`
page.

## What is here

| File                    | Use                                                |
| ----------------------- | -------------------------------------------------- |
| `open-mic-explorer.pdf` | the original, for download and for print           |
| `pages/page-1..5.webp`  | 1400px wide renders, for inline display on the web |
| `open-mic-explorer.txt` | extracted copy, for building a responsive version  |

Renders were made with `pdftoppm -png -r 150` then `cwebp -q 82 -resize
1400 0`. WebP because the five PNGs came to 1.4 MB and the WebP set is 604
KB, and this is going on a page people open on a phone outside a venue.

## Read this before putting the pages on the web

A US Letter sheet with two columns of small body text does not survive
being shown on a phone. At a 400px viewport the feature descriptions on
pages 2 to 4 are unreadable without pinch zoom, and a visitor who has to
pinch usually just leaves. The page images are fine as a _gallery with
zoom_ and fine as a download; they are not fine as the primary way to read
this content on mobile.

`open-mic-explorer.txt` exists so the website can render the same copy as
real, responsive, selectable, indexable HTML, with the PDF offered
alongside for anyone who wants the sheet itself.

## Two things in the PDF that need checking against where it is published

1. Page 5 says "Seattle is the first Open Mic Explorer city." The website's
   `/open-mics` map lists mics across Bellingham, Tacoma, Portland,
   Vancouver, Olympia, Blaine, and Chehalis. Both statements are true about
   different products that share a name, and side by side on one page they
   read as a contradiction.
2. The performer walkthrough opens with "Open the app and just browse. No
   account needed. Every mic near you is visible immediately." That
   describes the capability. The app launches with no listings by owner
   decision, so on day one there is nothing to browse.

Neither is a defect in the PDF. Both matter when it sits on a page that
also shows 85 live mics.
