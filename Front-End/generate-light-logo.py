"""
RealSync Light-Background Logo Generator
=========================================
Processes the existing dark-optimized logos to create variants
that work cleanly on white/light backgrounds.

Strategy:
  - Colorful pixels (cyan, blue, green, purple from the eye gradient) -> kept as-is
  - Light/white/gray pixels (the wordmark, inner iris) -> remapped to dark navy/purple
  - Alpha channel fully preserved

Run:  python3 generate-light-logo.py

Dependencies: Pillow (PIL) only — no numpy required.
"""

import os
import shutil
from PIL import Image

# ──────────────────────────────────────────
# PATHS
# ──────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(SCRIPT_DIR, 'src', 'assets')
DESKTOP = os.path.expanduser('~/Desktop')

LOGO_FULL_PATH = os.path.join(ASSETS_DIR, '4401d6799dc4e6061a79080f8825d69ae920f198.png')
LOGO_EYE_PATH  = os.path.join(ASSETS_DIR, 'realsync-eye-only.png')

OUT_FULL_PATH = os.path.join(ASSETS_DIR, 'realsync-logo-light.png')
OUT_EYE_PATH  = os.path.join(ASSETS_DIR, 'realsync-eye-light.png')

# Brand dark colors for remapping light pixels (R, G, B)
DARK_COLOR  = (26, 26, 46)     # #1A1A2E (bgCard — deep navy)
DARK_ACCENT = (55, 48, 120)    # Deep indigo-purple blend


def pixel_brightness(r, g, b):
    """ITU-R BT.601 perceived brightness."""
    return 0.299 * r + 0.587 * g + 0.114 * b


def pixel_saturation(r, g, b):
    """Color saturation: 0 = pure gray, 255 = vivid color."""
    return max(r, g, b) - min(r, g, b)


def darken_pixel(r, g, b, strength=0.85):
    """
    Remap a light/white pixel to a dark navy tone.
    strength: 0.0 = keep original, 1.0 = full dark replacement
    """
    bright_factor = pixel_brightness(r, g, b) / 255.0
    result = []
    for ch, orig in enumerate([r, g, b]):
        # Blend between DARK_COLOR and DARK_ACCENT based on brightness
        target = DARK_COLOR[ch] * bright_factor + DARK_ACCENT[ch] * (1 - bright_factor)
        # Mix: mostly target, small amount of original for texture
        val = target * strength + orig * (1 - strength) * 0.3 + DARK_COLOR[ch] * (1 - strength) * 0.7
        result.append(int(max(0, min(255, val))))
    return tuple(result)


def process_logo(input_path, output_path, label):
    """
    Process a single logo PNG: darken light/white pixels,
    preserve colorful pixels, maintain alpha.
    """
    print(f"\n  Processing: {label}")
    print(f"  Input:  {input_path}")

    img = Image.open(input_path).convert('RGBA')
    pixels = img.load()
    width, height = img.size

    dark_strong = 0
    dark_mild = 0
    total_visible = 0

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]

            # Skip fully transparent pixels
            if a == 0:
                continue

            total_visible += 1

            brightness = pixel_brightness(r, g, b)
            saturation = pixel_saturation(r, g, b)

            # Strong darkening: bright + desaturated = white/gray text/outlines
            if brightness > 150 and saturation < 70:
                nr, ng, nb = darken_pixel(r, g, b, strength=0.85)
                pixels[x, y] = (nr, ng, nb, a)
                dark_strong += 1

            # Mild darkening: semi-bright grays
            elif brightness > 100 and saturation < 50:
                nr, ng, nb = darken_pixel(r, g, b, strength=0.65)
                pixels[x, y] = (nr, ng, nb, a)
                dark_mild += 1

            # Colorful or already dark pixels: keep as-is

    print(f"  Visible pixels: {total_visible:,}")
    print(f"  Darkened (strong): {dark_strong:,}")
    print(f"  Darkened (mild): {dark_mild:,}")

    img.save(output_path, 'PNG', optimize=True)
    print(f"  Output: {output_path}")

    return output_path


def main():
    print("=" * 50)
    print("RealSync Light-Background Logo Generator")
    print("=" * 50)

    # Check inputs exist
    for p, name in [(LOGO_FULL_PATH, 'Full lockup'), (LOGO_EYE_PATH, 'Eye-only icon')]:
        if not os.path.exists(p):
            print(f"  ERROR: {name} not found at {p}")
            return

    # Process both logos
    full_out = process_logo(LOGO_FULL_PATH, OUT_FULL_PATH, 'Full Lockup (eye + wordmark)')
    eye_out  = process_logo(LOGO_EYE_PATH, OUT_EYE_PATH, 'Eye-Only Icon')

    # Copy to Desktop for easy access
    desktop_full = os.path.join(DESKTOP, 'realsync-logo-light.png')
    desktop_eye  = os.path.join(DESKTOP, 'realsync-eye-light.png')
    shutil.copy2(full_out, desktop_full)
    shutil.copy2(eye_out, desktop_eye)

    print("\n" + "=" * 50)
    print("Done! Light-background logos generated:")
    print(f"  Assets:  {OUT_FULL_PATH}")
    print(f"           {OUT_EYE_PATH}")
    print(f"  Desktop: {desktop_full}")
    print(f"           {desktop_eye}")
    print("=" * 50)


if __name__ == '__main__':
    main()
