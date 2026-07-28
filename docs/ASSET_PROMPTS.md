# Image Asset Prompts

Prompt pack for generating the app's visual assets with an image generator. Prepend the Style Block to every prompt and generate one asset at a time.

Status of delivered assets:

- [x] UI glyph set (10 glyphs): delivered, lives in `assets/glyphs/`, rendered by `src/components/glyph.tsx` with runtime tinting.
- [ ] App icon, adaptive icon (foreground, monochrome), splash icon
- [ ] Android notification small icon
- [ ] Map markers (4 discipline pins, stale pin, cluster bubble)
- [ ] Empty state illustrations (5)
- [ ] Role card illustrations (2)
- [ ] Store assets (screenshots, Play feature graphic): Phase 8

## Style Block

Flat minimalist vector graphic for a dark-themed mobile app about open mic nights (music, comedy, poetry). Near-black background #0B0B0F unless transparency is requested. Clean geometric shapes, 2px uniform stroke weight, rounded line caps, generous negative space. Strictly limited palette: white #F4F4F6, gray #A8A8B3, plus at most ONE accent color per image. Accent colors: music blue #4DA6FF, comedy amber #FFB84D, poetry purple #C084FC, neutral gray #8A8A96. No gradients, no shadows, no 3D, no photorealism, no texture, no text unless specified. Centered composition, crisp edges, suitable for SVG conversion.

## App icon

App icon, 1024x1024, filled square, no rounded corners, no transparency. A single bold microphone glyph in white centered on near-black #0B0B0F, with three small sound-wave arcs radiating from it, one arc in blue #4DA6FF, one in amber #FFB84D, one in purple #C084FC, representing music, comedy, and poetry. Extremely simple, must stay readable at 40 pixels. No text, no border, no gloss.

## Adaptive icon foreground (Android)

Same microphone glyph with three colored arcs as the app icon, but on a fully transparent background, glyph occupying only the center 60% of the canvas with empty margin all around. 1024x1024.

## Adaptive icon monochrome (Android themed)

Same microphone glyph with three arcs, entirely in solid white #FFFFFF on a transparent background, single flat silhouette with no color and no shading. 1024x1024, glyph within the center 60%.

## Splash icon

The microphone-with-three-arcs glyph in pure white on a transparent background, 1024x1024, centered, simple enough to display alone on a near-black launch screen.

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

## Generation tips

- Generate the app icon first, then reference it for style consistency; reuse seeds where the tool allows.
- The four discipline markers must share an identical pin silhouette; generate one and recolor if possible.
- If true transparency is unavailable, use a solid #00FF00 background for keying, or deliver on #0B0B0F for assets that only appear on the app background.
- PNG at the largest available size; downscaling, slicing, and vectorizing happen in the repo.
