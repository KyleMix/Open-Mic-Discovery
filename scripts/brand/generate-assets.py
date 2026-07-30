#!/usr/bin/env python3
"""Regenerate every derived brand asset from assets/brand/mark.svg.

The Open Mic Explorer mark is a map pin whose interior is a microphone with a
downward arrow for the pin point. assets/brand/mark.svg is the vector source of
truth (traced from the delivered artwork, brand green #0FFEA7). Everything
below is derived from it so the icon set never drifts from the logo.

Usage:
    pip install pillow cairosvg
    python3 scripts/brand/generate-assets.py

Outputs (all sizes chosen to match app.json):
    assets/brand/mark.png, mark@2x.png, mark@3x.png   React Native lockup mark
    assets/images/icon.png                            app icon, opaque
    assets/images/splash-icon.png                     splash, transparent
    assets/images/favicon.png                         web favicon, transparent
    assets/images/android-icon-foreground.png         adaptive foreground
    assets/images/android-icon-monochrome.png         themed icon silhouette
    assets/images/android-icon-background.png         adaptive background
"""

from __future__ import annotations

import io
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MARK_SVG = ROOT / "assets" / "brand" / "mark.svg"

BRAND_GREEN = "#0FFEA7"
WHITE = "#FFFFFF"
# palette.bg from src/theme/tokens.ts. Every opaque surface uses this so the
# icon, the splash screen, and the app chrome are the same near-black.
BACKGROUND = (11, 11, 15, 255)

# Native aspect of the mark: taller than it is wide.
MARK_W, MARK_H = 329, 423
ASPECT = MARK_W / MARK_H


def render_mark(height: int, color: str) -> Image.Image:
    """Rasterize the mark at a given height, transparent background."""
    width = round(height * ASPECT)
    svg = MARK_SVG.read_text().replace("currentColor", color)
    png = cairosvg.svg2png(
        bytestring=svg.encode(), output_width=width, output_height=height
    )
    return Image.open(io.BytesIO(png)).convert("RGBA")


def compose(canvas: int, height_ratio: float, color: str, background) -> Image.Image:
    """Center the mark on a square canvas, sized as a fraction of the canvas."""
    mark = render_mark(round(canvas * height_ratio), color)
    out = Image.new("RGBA", (canvas, canvas), background)
    out.alpha_composite(mark, ((canvas - mark.width) // 2, (canvas - mark.height) // 2))
    return out


def write(image: Image.Image, *parts: str) -> None:
    path = ROOT.joinpath(*parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    print(f"{path.relative_to(ROOT)}  {image.width}x{image.height}")


def main() -> None:
    transparent = (0, 0, 0, 0)

    # Lockup mark for src/components/logo.tsx. Base height 72pt covers every
    # on-screen use (nav header 32, sign-in 48) with a 3x asset to spare.
    for scale, suffix in ((1, ""), (2, "@2x"), (3, "@3x")):
        write(render_mark(72 * scale, BRAND_GREEN), "assets", "brand", f"mark{suffix}.png")

    # App icon: opaque, no transparency, no rounded corners. 80% height leaves
    # margin for the platform corner masks.
    write(compose(1024, 0.80, BRAND_GREEN, BACKGROUND), "assets", "images", "icon.png")

    # Splash: transparent, drawn over backgroundColor #0B0B0F at imageWidth 132.
    write(compose(1024, 0.88, BRAND_GREEN, transparent), "assets", "images", "splash-icon.png")

    # Web favicon.
    write(compose(196, 0.88, BRAND_GREEN, transparent), "assets", "images", "favicon.png")

    # Android adaptive icon. The launcher mask crops hard, so the mark stays
    # inside the center 60% safe zone.
    write(
        compose(1024, 0.60, BRAND_GREEN, transparent),
        "assets", "images", "android-icon-foreground.png",
    )
    write(
        compose(1024, 0.60, WHITE, transparent),
        "assets", "images", "android-icon-monochrome.png",
    )
    write(
        Image.new("RGBA", (1024, 1024), BACKGROUND),
        "assets", "images", "android-icon-background.png",
    )


if __name__ == "__main__":
    main()
