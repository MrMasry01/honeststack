"""
HonestStack social asset generator.

Reads brand/pharaoh-logo-v2.png and writes every standard social
format under brand/social/ — profile pics, favicons, branded banners.

Run from project root:
    py -3 brand/generate_assets.py
or:
    "C:/Users/maro2/AppData/Local/Programs/Python/Python312/python.exe" brand/generate_assets.py

Requires Pillow:  pip install pillow
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ─────────────────────────────────────────────────────────────────
# Paths + brand palette
# ─────────────────────────────────────────────────────────────────
BRAND_DIR = Path(__file__).resolve().parent
# Look for the source in either brand/ or brand/logos/ — the AI image
# tool may save into either.
_candidates = [
    BRAND_DIR / "pharaoh-logo-v2.png",
    BRAND_DIR / "logos" / "pharaoh-logo-v2.png",
]
SRC = next((p for p in _candidates if p.exists()), _candidates[0])
OUT = BRAND_DIR / "social"
OUT.mkdir(exist_ok=True)

# HonestStack palette — matches brand_settings in Supabase + cockpit
EGYPT_RED = (230, 51, 41)        # #E63329 — brand primary (jersey + Egypt)
GOLD = (244, 194, 13)            # #F4C20D — brand accent (Pharaoh headdress)
NAVY = (14, 27, 44)              # #0E1B2C — cockpit background
NEAR_BLACK = (10, 10, 10)        # #0A0A0A
WHITE = (255, 255, 255)
SOFT_GOLD = (255, 220, 100)      # for subtle glow

# Try system fonts in priority order; PIL falls back to bitmap default
# if none exist (still legible, just less polished).
FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeuib.ttf",     # Segoe UI Bold (Windows default)
    "C:/Windows/Fonts/arialbd.ttf",      # Arial Bold
    "C:/Windows/Fonts/arial.ttf",        # Arial
    "/System/Library/Fonts/SFNS.ttf",    # macOS
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


# ─────────────────────────────────────────────────────────────────
# Load source
# ─────────────────────────────────────────────────────────────────
if not SRC.exists():
    print(f"ERROR: source image not found at {SRC}", file=sys.stderr)
    print("Save your logo there first, then re-run.", file=sys.stderr)
    sys.exit(1)

src_raw = Image.open(SRC).convert("RGBA")
print(f"Source: {SRC.name} {src_raw.size[0]}x{src_raw.size[1]} mode={src_raw.mode}")


def remove_white_background(img: Image.Image, threshold: int = 235) -> Image.Image:
    """Flood-fill near-white pixels from each corner inward, making them
    transparent. Preserves internal whites (teeth, headdress highlights)
    because flood-fill only touches connected near-white regions from the
    edges — the Pharaoh's body acts as a wall."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    pixels = rgba.load()

    # BFS flood-fill from all 4 corners. Mark visited cells as transparent.
    from collections import deque
    visited = [[False] * h for _ in range(w)]
    q = deque()
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]

    def is_bg(p):
        r, g, b, a = p
        return r >= threshold and g >= threshold and b >= threshold and a >= 250

    for cx, cy in corners:
        if not visited[cx][cy] and is_bg(pixels[cx, cy]):
            q.append((cx, cy))
            visited[cx][cy] = True

    while q:
        x, y = q.popleft()
        pixels[x, y] = (0, 0, 0, 0)  # transparent
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                if is_bg(pixels[nx, ny]):
                    visited[nx][ny] = True
                    q.append((nx, ny))

    # Soften the edge slightly so the silhouette doesn't look pixelated
    # when composited on a darker background.
    alpha = rgba.split()[-1].filter(ImageFilter.GaussianBlur(radius=0.6))
    rgba.putalpha(alpha)
    return rgba


print("Removing white background from source...")
src = remove_white_background(src_raw)


def square_crop(img: Image.Image) -> Image.Image:
    """Center-crop to square. Source already is square-ish, but safe."""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def resize_square(img: Image.Image, side: int) -> Image.Image:
    return square_crop(img).resize((side, side), Image.LANCZOS)


# ─────────────────────────────────────────────────────────────────
# Profile pics — square, white background (TikTok/IG/YT prefer this)
# ─────────────────────────────────────────────────────────────────
PROFILE_SIZES = {
    "profile-1024.png": 1024,   # master
    "profile-800.png": 800,     # YouTube logo
    "profile-400.png": 400,     # X / LinkedIn
    "profile-320.png": 320,     # Instagram
    "profile-200.png": 200,     # TikTok
    "profile-170.png": 170,     # Facebook page
    "profile-96.png": 96,       # small UI
    "apple-touch-icon-180.png": 180,  # iOS home screen
}

print("\n--- Profile pictures (square, white bg) ---")
for name, side in PROFILE_SIZES.items():
    # White background flatten — most platforms display rounded with
    # white edge; transparent PNG can render as black on dark themes.
    canvas = Image.new("RGB", (side, side), WHITE)
    fig = resize_square(src, side)
    canvas.paste(fig, (0, 0), fig if fig.mode == "RGBA" else None)
    out = OUT / name
    canvas.save(out, "PNG", optimize=True)
    print(f"  {name:32s} ({side}x{side})")


# ─────────────────────────────────────────────────────────────────
# Favicons
# ─────────────────────────────────────────────────────────────────
print("\n--- Favicons ---")
favicon_32 = resize_square(src, 32)
favicon_16 = resize_square(src, 16)
favicon_48 = resize_square(src, 48)

# White background for the small sizes — Pharaoh face is invisible at 16
# on dark browser tabs without it.
for img, side, name in [(favicon_16, 16, "favicon-16.png"),
                         (favicon_32, 32, "favicon-32.png"),
                         (favicon_48, 48, "favicon-48.png")]:
    canvas = Image.new("RGB", (side, side), WHITE)
    canvas.paste(img, (0, 0), img if img.mode == "RGBA" else None)
    canvas.save(OUT / name, "PNG", optimize=True)
    print(f"  {name:32s} ({side}x{side})")

# Multi-res .ico for legacy browsers and Windows
ico_canvas = Image.new("RGBA", (48, 48), (255, 255, 255, 255))
ico_canvas.paste(favicon_48, (0, 0), favicon_48)
ico_canvas.save(
    OUT / "favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
)
print(f"  favicon.ico                     (multi-res 16/32/48)")


# ─────────────────────────────────────────────────────────────────
# Banner composer — Pharaoh on red gradient + "HonestStack" + tagline
# ─────────────────────────────────────────────────────────────────
def gradient_background(size: tuple[int, int], top: tuple, bottom: tuple) -> Image.Image:
    """Vertical gradient from top → bottom colours."""
    w, h = size
    bg = Image.new("RGB", (w, h), top)
    px = bg.load()
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return bg


def add_pharaoh_with_glow(canvas: Image.Image, pharaoh: Image.Image, position: tuple[int, int], glow_color=GOLD) -> None:
    """Paste the Pharaoh with a soft gold glow behind it."""
    x, y = position
    # Build a blurred gold halo from the Pharaoh's silhouette alpha.
    if pharaoh.mode != "RGBA":
        pharaoh = pharaoh.convert("RGBA")
    alpha = pharaoh.split()[-1]
    halo = Image.new("RGBA", pharaoh.size, glow_color + (0,))
    halo_alpha = alpha.filter(ImageFilter.GaussianBlur(radius=35))
    halo.putalpha(halo_alpha)
    # Two-pass for stronger glow
    canvas.paste(halo, (x, y), halo)
    canvas.paste(halo, (x, y), halo)
    canvas.paste(pharaoh, (x, y), pharaoh)


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, max_height: int, start_size: int) -> ImageFont.FreeTypeFont:
    """Pick the largest font size where the text fits in (max_width, max_height)."""
    size = start_size
    while size > 12:
        font = load_font(size)
        bb = draw.textbbox((0, 0), text, font=font)
        if (bb[2] - bb[0]) <= max_width and (bb[3] - bb[1]) <= max_height:
            return font
        size -= 4
    return load_font(12)


def compose_banner(
    out_path: Path,
    size: tuple[int, int],
    title: str,
    tagline: str,
    pharaoh_height_ratio: float = 0.78,
    side: str = "right",
) -> None:
    """Compose: navy→red gradient + Pharaoh on one side + title + tagline.

    Pharaoh occupies ~38% of canvas width on the chosen side; text occupies
    the other ~55% with a safe margin between. Font auto-shrinks to fit so
    text never overlaps the Pharaoh."""
    w, h = size
    canvas = gradient_background(size, NAVY, EGYPT_RED).convert("RGBA")

    # Pharaoh sizing — never wider than 40% of canvas, height capped too.
    target_h = int(h * pharaoh_height_ratio)
    ratio = target_h / src.size[1]
    target_w = int(src.size[0] * ratio)
    max_pharaoh_w = int(w * 0.40)
    if target_w > max_pharaoh_w:
        target_w = max_pharaoh_w
        ratio = target_w / src.size[0]
        target_h = int(src.size[1] * ratio)
    pharaoh = src.resize((target_w, target_h), Image.LANCZOS)

    margin = int(h * 0.08)
    if side == "right":
        ph_x = w - target_w - margin
    else:
        ph_x = margin
    ph_y = (h - target_h) // 2  # vertically centered, looks cleaner
    add_pharaoh_with_glow(canvas, pharaoh, (ph_x, ph_y))

    # Text area: the half of the canvas opposite the Pharaoh, with margin.
    if side == "right":
        text_left = margin
        text_right = ph_x - margin
    else:
        text_left = ph_x + target_w + margin
        text_right = w - margin
    text_width = max(100, text_right - text_left)

    draw = ImageDraw.Draw(canvas)
    title_font = fit_font(draw, title, text_width, int(h * 0.32), int(h * 0.22))
    tagline_font = fit_font(draw, tagline, text_width, int(h * 0.14), int(h * 0.09))

    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]

    # Vertically center the text block
    block_h = title_h + int(h * 0.04) + int(h * 0.005) + int(h * 0.04) + int(h * 0.10)
    text_y = (h - block_h) // 2

    # Title shadow for depth
    shadow_offset = max(2, h // 250)
    draw.text(
        (text_left + shadow_offset, text_y + shadow_offset),
        title,
        font=title_font,
        fill=(0, 0, 0, 120),
    )
    draw.text((text_left, text_y), title, font=title_font, fill=WHITE)

    # Gold underline accent
    underline_y = text_y + title_h + int(h * 0.04)
    underline_w = min(int(title_w * 0.5), int(text_width * 0.5))
    draw.rectangle(
        [text_left, underline_y, text_left + underline_w, underline_y + max(3, h // 220)],
        fill=GOLD,
    )

    # Tagline
    draw.text(
        (text_left, underline_y + int(h * 0.05)),
        tagline,
        font=tagline_font,
        fill=GOLD,
    )

    canvas.convert("RGB").save(out_path, "PNG", optimize=True)


# ─────────────────────────────────────────────────────────────────
# Banners
# ─────────────────────────────────────────────────────────────────
print("\n--- Banners (composed: gradient + Pharaoh + title + tagline) ---")
BANNERS = [
    ("youtube-banner-2560x1440.png", (2560, 1440), "HonestStack", "Daily Egyptian football in 60 seconds"),
    ("x-header-1500x500.png",         (1500, 500),  "HonestStack", "Daily Egyptian football in 60 seconds"),
    ("fb-cover-820x312.png",          (820, 312),   "HonestStack", "Daily football, in Egyptian"),
    ("linkedin-cover-1584x396.png",   (1584, 396),  "HonestStack", "Automated short-form football news"),
]
for name, size, title, tagline in BANNERS:
    compose_banner(OUT / name, size, title, tagline)
    print(f"  {name:32s} ({size[0]}x{size[1]})")


# ─────────────────────────────────────────────────────────────────
# Instagram square (announcement-style)
# ─────────────────────────────────────────────────────────────────
print("\n--- Instagram square post ---")
ig_size = (1080, 1080)
ig = gradient_background(ig_size, NAVY, EGYPT_RED).convert("RGBA")

# Pharaoh centered-low
target_h = int(ig_size[1] * 0.72)
ratio = target_h / src.size[1]
target_w = int(src.size[0] * ratio)
ig_pharaoh = src.resize((target_w, target_h), Image.LANCZOS)
ph_x = (ig_size[0] - target_w) // 2
ph_y = ig_size[1] - target_h - 30
add_pharaoh_with_glow(ig, ig_pharaoh, (ph_x, ph_y))

draw = ImageDraw.Draw(ig)
title_font = load_font(120)
sub_font = load_font(46)

title = "HonestStack"
tagline = "Daily football, in Egyptian"

t_bbox = draw.textbbox((0, 0), title, font=title_font)
t_w = t_bbox[2] - t_bbox[0]
s_bbox = draw.textbbox((0, 0), tagline, font=sub_font)
s_w = s_bbox[2] - s_bbox[0]

draw.text(((ig_size[0] - t_w) // 2 + 4, 90 + 4), title, font=title_font, fill=(0, 0, 0, 120))
draw.text(((ig_size[0] - t_w) // 2, 90), title, font=title_font, fill=WHITE)

# gold rule
rule_w = 300
draw.rectangle(
    [(ig_size[0] - rule_w) // 2, 240, (ig_size[0] + rule_w) // 2, 244],
    fill=GOLD,
)
draw.text(((ig_size[0] - s_w) // 2, 270), tagline, font=sub_font, fill=GOLD)

ig.convert("RGB").save(OUT / "ig-post-1080x1080.png", "PNG", optimize=True)
print(f"  ig-post-1080x1080.png            (1080x1080)")


# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────
print(f"\nDone — {len(list(OUT.glob('*')))} files written to {OUT}")
print("\nNext: drag the relevant file into each platform's profile-pic upload box.")
