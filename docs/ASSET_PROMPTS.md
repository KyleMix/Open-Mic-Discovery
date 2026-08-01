# Image Asset Prompts

Prompt pack for generating the app's visual assets with an image generator. Prepend the Style Block to every prompt and generate one asset at a time.

Status of delivered assets:

- [x] UI glyph set (10 glyphs): delivered, lives in `assets/glyphs/`, rendered by `src/components/glyph.tsx` with runtime tinting.
- [x] Logo: delivered by the owner, lives in `assets/brand/`, see the Logo section below.
- [x] App icon, adaptive icon (foreground, monochrome), splash icon, favicon: generated from the logo by `scripts/brand/generate-assets.py`.
- [ ] Android notification small icon
- [ ] Map markers (4 discipline pins, stale pin, cluster bubble)
- [ ] Empty state illustrations (5)
- [ ] Role card illustrations (2)
- [ ] Store assets (screenshots, Play feature graphic): Phase 8

## Style Block

Flat minimalist vector graphic for a dark-themed mobile app about open mic nights (music, comedy, poetry). Near-black background #0B0B0F unless transparency is requested. Clean geometric shapes, 2px uniform stroke weight, rounded line caps, generous negative space. Strictly limited palette: white #F4F4F6, gray #A8A8B3, plus at most ONE accent color per image. Accent colors: music blue #4DA6FF, comedy amber #FFB84D, poetry purple #C084FC, neutral gray #8A8A96. No gradients, no shadows, no 3D, no photorealism, no texture, no text unless specified. Centered composition, crisp edges, suitable for SVG conversion.

## App icon, adaptive icon, splash icon, favicon (generated, not prompted)

Do not prompt an image generator for these. They are derived from the logo so
the icon set always matches the mark. Run:

```
python3 scripts/brand/generate-assets.py
```

That writes, all from `assets/brand/mark.svg`:

| File                                        | Size | Notes                                                 |
| ------------------------------------------- | ---- | ----------------------------------------------------- |
| `assets/images/icon.png`                    | 1024 | Opaque #0B0B0F, mark at 80% height.                   |
| `assets/images/splash-icon.png`             | 1024 | Transparent, mark at 88%. Paired with imageWidth 132. |
| `assets/images/favicon.png`                 | 196  | Transparent.                                          |
| `assets/images/android-icon-foreground.png` | 1024 | Transparent, mark inside the center 60% safe zone.    |
| `assets/images/android-icon-monochrome.png` | 1024 | White silhouette for Android themed icons.            |
| `assets/images/android-icon-background.png` | 1024 | Solid #0B0B0F.                                        |

To change a size or a margin, edit the script rather than the PNGs.

## Notification small icon (Android)

Tiny silhouette icon of a microphone, solid white on transparent background, one single flat shape with no interior detail, readable at 24 pixels, 96x96 canvas.

## Map markers (run 4 times, swap the bracketed parts)

Map pin marker for a mobile map, teardrop pin silhouette with a circular head, flat solid fill in [music blue #4DA6FF / comedy amber #FFB84D / poetry purple #C084FC / neutral gray #8A8A96], containing a tiny white [eighth note music glyph / open laughing mouth glyph / quill pen glyph / four-point spark glyph] centered in the head. Transparent background, portrait canvas, thin white 1px outline around the pin so it separates from dark map tiles. Identical pin silhouette across all four versions, only the fill color and inner glyph change.

## Marker variants

1. The same teardrop map pin silhouette, desaturated pale gray #63636E fill with a white question mark glyph in the head, transparent background. This marks a stale unconfirmed listing.
2. Round map cluster bubble: flat circle in dark elevated gray #16161D with a 2px white ring, empty center (number added in code), transparent background, 96x96.

## Empty state illustrations (run 5 times)

Frame: Minimal line illustration, white 2px strokes with a single accent color, transparent background, landscape 4:3, generous empty space, friendly but restrained mood, no text. Subject: [SUBJECT]

Subjects:

1. a lone microphone stand on a small round stage under a single spotlight cone, one subtle plus symbol floating beside it, accent color blue #4DA6FF (no mics in this city yet)
2. an outlined five-point star with a small microphone resting inside it, accent amber #FFB84D (no favorites yet)
3. a clipboard with three empty list lines and a pen, accent purple #C084FC (empty signup list)
4. a cloud outline disconnected from a plug and cable below it, gray only, no accent (offline)
5. a magnifying glass hovering over an upside-down empty map pin, accent blue #4DA6FF (no search results)

## Role card illustrations (run 2 times)

Small square minimal line illustration, white 2px strokes, one accent color, transparent background, 1:1, no text. Subject: [a person silhouette from behind standing at a microphone, stage light cone from above, accent blue #4DA6FF] OR [a person silhouette holding a clipboard beside a microphone stand, checkmark on the clipboard, accent amber #FFB84D]

## Delivered: UI glyph sheet (for reference or regeneration)

Icon sheet of ten minimal line icons, white 2px stroke on transparent background, all on the same grid, identical visual weight, 24x24 style, no fills, no text: 1) eighth note, 2) open laughing mouth, 3) quill pen, 4) four-point spark, 5) raffle ticket, 6) numbered list with three rows, 7) bookmark over a chair seat, 8) sealed envelope, 9) checkmark inside a circle, 10) map pin with a small pencil overlapping it.

## Logo: "Open Mic Explorer" (delivered, do not regenerate)

The logo is final artwork supplied by the owner, not a generated asset. It is a
map pin whose interior is a microphone, with the pin point drawn as a downward
arrow, in brand green `#0FFEA7`.

Source files in `assets/brand/`:

| File                    | What it is                                                 |
| ----------------------- | ---------------------------------------------------------- |
| `mark.svg`              | Vector mark, single path, `currentColor`. Source of truth. |
| `mark.png` (1x, 2x, 3x) | Rasterized mark for `src/components/logo.tsx`.             |
| `logo-mark-dark.png`    | Delivered mark on black, 500x500.                          |
| `logo-lockup.png`       | Delivered lockup, transparent background.                  |
| `logo-lockup-dark.png`  | Delivered lockup on black.                                 |

Every icon in `assets/images/` is derived from `mark.svg` by
`scripts/brand/generate-assets.py`. Run that script rather than editing the
PNGs, so the icon set cannot drift from the logo:

```
pip install pillow cairosvg
python3 scripts/brand/generate-assets.py
```

The wordmark is set as live text in `src/components/logo.tsx` (Poppins Regular,
all caps) rather than shipped as a bitmap, so it scales and recolors cleanly.

## Generation tips

- Generate the app icon first, then reference it for style consistency; reuse seeds where the tool allows.
- The four discipline markers must share an identical pin silhouette; generate one and recolor if possible.
- If true transparency is unavailable, use a solid #00FF00 background for keying, or deliver on #0B0B0F for assets that only appear on the app background.
- PNG at the largest available size; downscaling, slicing, and vectorizing happen in the repo.
